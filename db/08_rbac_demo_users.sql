USE RajendraGlassDb;
GO

-- Demo users for the new roles. Password for all: Admin@123 (same bcrypt hash as existing demo users)
DECLARE @hash NVARCHAR(200) = '$2b$10$O/DGg352KEtIX50Cna51heDwUlgJ/mEIdJ5d6.i4tLvfc/BlNnZNG';

IF NOT EXISTS (SELECT 1 FROM Security.[User] WHERE Username = 'manager')
BEGIN
    INSERT INTO Security.[User] (Username, FullName, Email, PasswordHash, IsActive)
    VALUES ('manager', 'Priya Sales Manager', 'manager@rajendraglass.local', @hash, 1);
    INSERT INTO Security.UserRole (UserId, RoleId)
    SELECT u.UserId, r.RoleId FROM Security.[User] u, Security.Role r WHERE u.Username = 'manager' AND r.Name = 'Sales Manager';
END

IF NOT EXISTS (SELECT 1 FROM Security.[User] WHERE Username = 'accountant')
BEGIN
    INSERT INTO Security.[User] (Username, FullName, Email, PasswordHash, IsActive)
    VALUES ('accountant', 'Anjali Accountant', 'accountant@rajendraglass.local', @hash, 1);
    INSERT INTO Security.UserRole (UserId, RoleId)
    SELECT u.UserId, r.RoleId FROM Security.[User] u, Security.Role r WHERE u.Username = 'accountant' AND r.Name = 'Accountant';
END

IF NOT EXISTS (SELECT 1 FROM Security.[User] WHERE Username = 'production')
BEGIN
    INSERT INTO Security.[User] (Username, FullName, Email, PasswordHash, IsActive)
    VALUES ('production', 'Suresh Production Supervisor', 'production@rajendraglass.local', @hash, 1);
    INSERT INTO Security.UserRole (UserId, RoleId)
    SELECT u.UserId, r.RoleId FROM Security.[User] u, Security.Role r WHERE u.Username = 'production' AND r.Name = 'Production Supervisor';
END

IF NOT EXISTS (SELECT 1 FROM Security.[User] WHERE Username = 'auditor')
BEGIN
    INSERT INTO Security.[User] (Username, FullName, Email, PasswordHash, IsActive)
    VALUES ('auditor', 'Vikram Auditor', 'auditor@rajendraglass.local', @hash, 1);
    INSERT INTO Security.UserRole (UserId, RoleId)
    SELECT u.UserId, r.RoleId FROM Security.[User] u, Security.Role r WHERE u.Username = 'auditor' AND r.Name = 'Auditor';
END
GO

PRINT 'RBAC demo users inserted successfully.';
