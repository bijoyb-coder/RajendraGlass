-- Delete for the remaining CRM/HR documents, same "nothing generated against it" pattern:
--   Complaint:  nothing references a complaint (confirmed via sys.foreign_keys) and it never
--               touches stock, so it is always deletable, subject to permission.
--   Attendance: likewise nothing references an attendance row and marking one has no side
--               effect on any other document, so it is always deletable, subject to permission.
-- Employee itself is deliberately excluded: it already has a dedicated 'Deactivate' action (FRS
-- 12.7, disables the record and its linked login) as its intentional soft-delete, Attendance
-- rows reference EmployeeId, and HR/payroll records typically need retention for compliance --
-- confirmed with the user rather than assumed.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Complaint.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Complaint.Delete', 'CRM', 'Delete a complaint');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Attendance.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Attendance.Delete', 'HR', 'Delete an attendance record');
GO

-- Owner / Administrator: everything, including the new permissions.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code IN ('Complaint.Delete', 'Attendance.Delete')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Sales Manager already resolves complaints; give it Delete too.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Sales Manager' AND p.Code = 'Complaint.Delete'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
