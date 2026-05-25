from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.deps import CurrentUser, require_roles
from app.db.models import User, UserGroup, UserGroupMember
from app.db.session import get_db
from app.schemas.user_group import UserGroupCreate, UserGroupMemberOut, UserGroupOut, UserGroupUpdate

router = APIRouter(prefix="/admin/user-groups", tags=["User groups"])

ADMIN_ROLES = ("company_admin", "manager")


def _group_out(group: UserGroup) -> UserGroupOut:
    members = []
    for m in group.members:
        if m.user:
            members.append(
                UserGroupMemberOut(
                    user_id=m.user.id,
                    full_name=m.user.full_name,
                    email=m.user.email,
                )
            )
    return UserGroupOut(
        id=group.id,
        name=group.name,
        member_count=len(members),
        members=members,
        created_at=group.created_at,
    )


@router.get("", response_model=list[UserGroupOut])
def list_user_groups(
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[UserGroupOut]:
    groups = db.scalars(
        select(UserGroup)
        .where(UserGroup.company_id == user.company_id)
        .options(joinedload(UserGroup.members).joinedload(UserGroupMember.user))
        .order_by(UserGroup.name)
    ).unique()
    return [_group_out(g) for g in groups]


@router.post("", response_model=UserGroupOut, status_code=status.HTTP_201_CREATED)
def create_user_group(
    body: UserGroupCreate,
    user: CurrentUser = Depends(require_roles("company_admin")),
    db: Session = Depends(get_db),
) -> UserGroupOut:
    name = body.name.strip()
    if db.scalar(
        select(UserGroup.id).where(
            UserGroup.company_id == user.company_id,
            func.lower(UserGroup.name) == name.lower(),
        )
    ):
        raise HTTPException(status_code=409, detail="A user group with this name already exists")
    group = UserGroup(company_id=user.company_id, name=name)
    db.add(group)
    db.flush()
    for uid in body.user_ids:
        u = db.get(User, uid)
        if u and u.company_id == user.company_id:
            db.add(UserGroupMember(group_id=group.id, user_id=uid))
    db.commit()
    group = db.scalar(
        select(UserGroup)
        .where(UserGroup.id == group.id)
        .options(joinedload(UserGroup.members).joinedload(UserGroupMember.user))
    )
    return _group_out(group)


@router.patch("/{group_id}", response_model=UserGroupOut)
def update_user_group(
    group_id: UUID,
    body: UserGroupUpdate,
    user: CurrentUser = Depends(require_roles("company_admin")),
    db: Session = Depends(get_db),
) -> UserGroupOut:
    group = db.scalar(
        select(UserGroup)
        .where(UserGroup.id == group_id, UserGroup.company_id == user.company_id)
        .options(joinedload(UserGroup.members).joinedload(UserGroupMember.user))
    )
    if not group:
        raise HTTPException(status_code=404, detail="User group not found")
    if body.name is not None:
        name = body.name.strip()
        clash = db.scalar(
            select(UserGroup.id).where(
                UserGroup.company_id == user.company_id,
                func.lower(UserGroup.name) == name.lower(),
                UserGroup.id != group_id,
            )
        )
        if clash:
            raise HTTPException(status_code=409, detail="A user group with this name already exists")
        group.name = name
    if body.user_ids is not None:
        for m in list(group.members):
            db.delete(m)
        db.flush()
        for uid in body.user_ids:
            u = db.get(User, uid)
            if u and u.company_id == user.company_id:
                db.add(UserGroupMember(group_id=group.id, user_id=uid))
    db.commit()
    db.refresh(group)
    return _group_out(group)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_group(
    group_id: UUID,
    user: CurrentUser = Depends(require_roles("company_admin")),
    db: Session = Depends(get_db),
) -> None:
    group = db.get(UserGroup, group_id)
    if not group or group.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="User group not found")
    db.delete(group)
    db.commit()
