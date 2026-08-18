-- Rajendra Glass Centre - Inventory Management System
-- Phase 4: RBAC (SDD 8.2, FRS 12.3 four levels) + MFA (SDD 8.1, FRS 12.2) + refresh-token support

USE RajendraGlassDb;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET ANSI_NULLS ON;
GO

-------------------------------------------------------------------
-- Security.User: MFA + password-policy fields
-------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Security.[User]') AND name = 'MfaEnabled')
    ALTER TABLE Security.[User] ADD MfaEnabled BIT NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Security.[User]') AND name = 'MfaSecret')
    ALTER TABLE Security.[User] ADD MfaSecret NVARCHAR(64) NULL;   -- Base32 TOTP secret
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Security.[User]') AND name = 'PasswordChangedOn')
    ALTER TABLE Security.[User] ADD PasswordChangedOn DATETIME2 NULL;
GO

-------------------------------------------------------------------
-- Security.Role: MFA requirement flag (FRS 12.2 — compulsory for
-- Owner, Administrator, Accountant, Super Admin; configurable for others)
-------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Security.Role') AND name = 'IsMfaRequired')
    ALTER TABLE Security.Role ADD IsMfaRequired BIT NOT NULL DEFAULT 0;
GO

-------------------------------------------------------------------
-- Permission catalogue (Appendix B naming: Resource.Action)
-------------------------------------------------------------------
IF OBJECT_ID('Security.Permission') IS NULL
CREATE TABLE Security.Permission (
    PermissionId INT IDENTITY PRIMARY KEY,
    Code         NVARCHAR(60) NOT NULL UNIQUE,
    Module       NVARCHAR(40) NOT NULL,
    Description  NVARCHAR(200) NULL
);
GO

IF OBJECT_ID('Security.RolePermission') IS NULL
CREATE TABLE Security.RolePermission (
    RoleId       INT NOT NULL FOREIGN KEY REFERENCES Security.Role(RoleId),
    PermissionId INT NOT NULL FOREIGN KEY REFERENCES Security.Permission(PermissionId),
    PRIMARY KEY (RoleId, PermissionId)
);
GO

-------------------------------------------------------------------
-- Data-level scope (FRS 12.3 level 3): restrict a user to specific
-- branches/godowns. No rows for a user = unrestricted (all branches).
-------------------------------------------------------------------
IF OBJECT_ID('Security.UserScope') IS NULL
CREATE TABLE Security.UserScope (
    UserScopeId INT IDENTITY PRIMARY KEY,
    UserId   INT NOT NULL FOREIGN KEY REFERENCES Security.[User](UserId),
    BranchId INT NULL FOREIGN KEY REFERENCES Company.Branch(BranchId),
    GodownId INT NULL FOREIGN KEY REFERENCES Company.Godown(GodownId)
);
GO

-------------------------------------------------------------------
-- Value limits (FRS 7.7): discount %, credit limit, PO value, adjustment value
-------------------------------------------------------------------
IF OBJECT_ID('Security.RoleLimit') IS NULL
CREATE TABLE Security.RoleLimit (
    RoleLimitId INT IDENTITY PRIMARY KEY,
    RoleId      INT NOT NULL FOREIGN KEY REFERENCES Security.Role(RoleId),
    LimitType   NVARCHAR(30) NOT NULL,   -- Discount, CreditLimit, PoValue, AdjustmentValue
    MaxValue    DECIMAL(14,2) NOT NULL,
    CONSTRAINT UQ_RoleLimit UNIQUE (RoleId, LimitType)
);
GO

PRINT 'RBAC/MFA schema created successfully.';
