from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.deps import CurrentUser, require_roles
from app.core.security import hash_password
from app.db.models import Branch, Department, Role, User, UserRole
from app.db.session import get_db
from app.schemas.org import (
    BranchCreate,
    BranchOut,
    DepartmentCreate,
    DepartmentOut,
    RoleOut,
    UserCreate,
    UserOut,
)

router = APIRouter(prefix="/admin", tags=["Admin"])

ADMIN_ROLES = ("company_admin",)


def _user_out(user: User) -> UserOut:
    roles = [ur.role.slug for ur in user.user_roles if ur.role]
    return UserOut(id=user.id, email=user.email, full_name=user.full_name, is_active=user.is_active, roles=roles)


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
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
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> Department:
    dept = Department(company_id=user.company_id, name=body.name.strip(), code=body.code)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@router.get("/branches", response_model=list[BranchOut])
def list_branches(
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
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
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> Branch:
    branch = Branch(company_id=user.company_id, name=body.name.strip(), code=body.code)
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


@router.get("/roles", response_model=list[RoleOut])
def list_roles(
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[Role]:
    return list(
        db.scalars(
            select(Role)
            .where(Role.company_id == user.company_id)
            .order_by(Role.slug)
        )
    )


@router.get("/users", response_model=list[UserOut])
def list_users(
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    users = db.scalars(
        select(User)
        .where(User.company_id == user.company_id)
        .options(joinedload(User.user_roles).joinedload(UserRole.role))
        .order_by(User.email)
    )
    return [_user_out(u) for u in users]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
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
