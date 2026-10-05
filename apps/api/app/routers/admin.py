import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core import permissions as perms
from app.core.deps import CurrentUser, require_permission
from app.core.security import hash_password
from app.db.models import (
    Branch,
    Company,
    Department,
    Role,
    User,
    UserGroup,
    UserRole,
    WorkflowDefinition,
)
from app.db.session import get_db
from app.schemas.org import (
    BranchCreate,
    BranchOut,
    DepartmentCreate,
    DepartmentOut,
    PermissionOut,
    RoleCreate,
    RoleOut,
    RoleUpdate,
    UserCreate,
    UserOut,
    UserRolesUpdate,
)
from app.schemas.phase1 import (
    CompanyBranding,
    CompanyBrandingUpdate,
    CompanySettingsOut,
    CompanySettingsUpdate,
    SetupStatusOut,
)
from app.services.company_settings import (
    branding_from_settings,
    company_settings_from_dict,
    merge_branding,
    merge_company_settings,
)

router = APIRouter(prefix="/admin", tags=["Admin"])

ADMIN_ROLES = ("company_admin",)  # retained for back-compat imports; gates use require_permission


def _user_out(user: User) -> UserOut:
    roles = [ur.role.slug for ur in user.user_roles if ur.role]
    return UserOut(id=user.id, email=user.email, full_name=user.full_name, is_active=user.is_active, roles=roles)


def _role_out(role: Role) -> RoleOut:
    return RoleOut(
        id=role.id,
        slug=role.slug,
        name=role.name,
        permissions=sorted(perms.permissions_for_role(role.slug, role.permissions)),
        is_builtin=perms.is_builtin(role.slug),
    )


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")
    return (base or "role")[:50]


def _clean_permissions(keys: list[str]) -> list[str]:
    return [k for k in dict.fromkeys(keys) if k in perms.ALL_PERMISSIONS]


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> list[Department]:
    return list(
        db.scalars(
            select(Department)
            .where(Department.company_id == user.company_id)
            .order_by(Department.name)
        )
    )


@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
def create_department(
    body: DepartmentCreate,
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> Department:
    dept = Department(company_id=user.company_id, name=body.name.strip(), code=body.code)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@router.get("/branches", response_model=list[BranchOut])
def list_branches(
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> list[Branch]:
    return list(
        db.scalars(
            select(Branch).where(Branch.company_id == user.company_id).order_by(Branch.name)
        )
    )


@router.post("/branches", response_model=BranchOut, status_code=status.HTTP_201_CREATED)
def create_branch(
    body: BranchCreate,
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> Branch:
    branch = Branch(company_id=user.company_id, name=body.name.strip(), code=body.code)
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


@router.get("/permissions", response_model=list[PermissionOut])
def list_permissions(
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
) -> list[PermissionOut]:
    """The permission catalog managers tick when defining a role."""
    return [PermissionOut(**p) for p in perms.CATALOG]


@router.get("/roles", response_model=list[RoleOut])
def list_roles(
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> list[RoleOut]:
    roles = db.scalars(
        select(Role).where(Role.company_id == user.company_id).order_by(Role.slug)
    )
    return [_role_out(r) for r in roles]


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(
    body: RoleCreate,
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> RoleOut:
    slug = _slugify(body.name)
    if perms.is_builtin(slug) or db.scalar(
        select(Role).where(Role.company_id == user.company_id, Role.slug == slug)
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A role with that name already exists")
    role = Role(
        company_id=user.company_id,
        slug=slug,
        name=body.name.strip(),
        permissions=_clean_permissions(body.permissions),
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return _role_out(role)


@router.patch("/roles/{role_id}", response_model=RoleOut)
def update_role(
    role_id: UUID,
    body: RoleUpdate,
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> RoleOut:
    role = db.get(Role, role_id)
    if not role or role.company_id != user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if perms.is_builtin(role.slug):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Built-in roles cannot be edited")
    if body.name is not None:
        role.name = body.name.strip()
    if body.permissions is not None:
        role.permissions = _clean_permissions(body.permissions)
    db.commit()
    db.refresh(role)
    return _role_out(role)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: UUID,
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> None:
    role = db.get(Role, role_id)
    if not role or role.company_id != user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if perms.is_builtin(role.slug):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Built-in roles cannot be deleted")
    in_use = db.scalar(select(func.count()).select_from(UserRole).where(UserRole.role_id == role.id)) or 0
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Role is assigned to {in_use} user(s); reassign them first",
        )
    db.delete(role)
    db.commit()


@router.put("/users/{user_id}/roles", response_model=UserOut)
def set_user_roles(
    user_id: UUID,
    body: UserRolesUpdate,
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> UserOut:
    target = db.scalar(
        select(User)
        .where(User.id == user_id, User.company_id == user.company_id)
        .options(joinedload(User.user_roles))
    )
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    roles = list(
        db.scalars(
            select(Role).where(Role.company_id == user.company_id, Role.slug.in_(body.role_slugs))
        )
    )
    db.query(UserRole).filter(UserRole.user_id == target.id).delete(synchronize_session=False)
    for role in roles:
        db.add(UserRole(user_id=target.id, role_id=role.id))
    db.commit()
    db_user = db.scalar(
        select(User)
        .where(User.id == target.id)
        .options(joinedload(User.user_roles).joinedload(UserRole.role))
    )
    return _user_out(db_user)


@router.get("/users", response_model=list[UserOut])
def list_users(
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    users = db.scalars(
        select(User)
        .where(User.company_id == user.company_id)
        .options(joinedload(User.user_roles).joinedload(UserRole.role))
        .order_by(User.email)
    ).unique()
    return [_user_out(u) for u in users]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> UserOut:
    email = body.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    new_user = User(
        company_id=user.company_id,
        email=email,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip(),
    )
    db.add(new_user)
    db.flush()

    for slug in body.role_slugs:
        role = db.scalar(
            select(Role).where(Role.company_id == user.company_id, Role.slug == slug)
        )
        if role:
            db.add(UserRole(user_id=new_user.id, role_id=role.id))

    db.commit()
    db_user = db.scalar(
        select(User)
        .where(User.id == new_user.id)
        .options(joinedload(User.user_roles).joinedload(UserRole.role))
    )
    return _user_out(db_user)


@router.get("/setup-status", response_model=SetupStatusOut)
def setup_status(
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> SetupStatusOut:
    cid = user.company_id
    dept_count = db.scalar(select(func.count()).select_from(Department).where(Department.company_id == cid)) or 0
    user_count = db.scalar(
        select(func.count()).select_from(User).where(User.company_id == cid, User.is_active.is_(True))
    ) or 0
    group_count = db.scalar(select(func.count()).select_from(UserGroup).where(UserGroup.company_id == cid)) or 0
    wf_count = db.scalar(
        select(func.count()).select_from(WorkflowDefinition).where(WorkflowDefinition.company_id == cid)
    ) or 0
    published_count = db.scalar(
        select(func.count())
        .select_from(WorkflowDefinition)
        .where(WorkflowDefinition.company_id == cid, WorkflowDefinition.status == "published")
    ) or 0

    steps = {
        "departments": dept_count > 0,
        "users": user_count >= 2,
        "groups": group_count > 0,
        "workflows": wf_count > 0,
        "published_workflow": published_count > 0,
    }
    done = sum(1 for v in steps.values() if v)
    total = len(steps)
    percent = round(100.0 * done / total, 1) if total else 0.0
    return SetupStatusOut(steps=steps, complete=done == total, percent=percent)


@router.get("/company/settings", response_model=CompanySettingsOut)
def get_company_settings(
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> CompanySettingsOut:
    company = db.get(Company, user.company_id)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return CompanySettingsOut(**company_settings_from_dict(company.settings))


@router.patch("/company/settings", response_model=CompanySettingsOut)
def update_company_settings(
    body: CompanySettingsUpdate,
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> CompanySettingsOut:
    company = db.get(Company, user.company_id)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    company.settings = merge_company_settings(
        company.settings, body.model_dump(exclude_unset=True)
    )
    db.commit()
    db.refresh(company)
    return CompanySettingsOut(**company_settings_from_dict(company.settings))


@router.get("/company/branding", response_model=CompanyBranding)
def get_company_branding(
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> CompanyBranding:
    company = db.get(Company, user.company_id)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return CompanyBranding(**branding_from_settings(company.settings))


@router.patch("/company/branding", response_model=CompanyBranding)
def update_company_branding(
    body: CompanyBrandingUpdate,
    user: CurrentUser = Depends(require_permission(perms.USERS_MANAGE)),
    db: Session = Depends(get_db),
) -> CompanyBranding:
    company = db.get(Company, user.company_id)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    company.settings = merge_branding(company.settings, body.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(company)
    return CompanyBranding(**branding_from_settings(company.settings))
