"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Permission = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "admin";
    UserRole["EDITOR"] = "editor";
    UserRole["VIEWER"] = "viewer";
    UserRole["USER"] = "user";
})(UserRole || (exports.UserRole = UserRole = {}));
var Permission;
(function (Permission) {
    Permission["DOCUMENT_READ"] = "document:read";
    Permission["DOCUMENT_WRITE"] = "document:write";
    Permission["DOCUMENT_DELETE"] = "document:delete";
    Permission["USER_MANAGE"] = "user:manage";
    Permission["ADMIN_ACCESS"] = "admin:access";
    Permission["SNAPSHOT_CREATE"] = "snapshot:create";
    Permission["SNAPSHOT_RESTORE"] = "snapshot:restore";
})(Permission || (exports.Permission = Permission = {}));
//# sourceMappingURL=auth.js.map