import os

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_admin

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/vapid-public-key")
def vapid_public_key(user: models.User = Depends(require_admin)):
    key = os.getenv("VAPID_PUBLIC_KEY")
    if not key or not os.getenv("VAPID_PRIVATE_KEY") or not os.getenv("VAPID_SUBJECT"):
        raise HTTPException(503, "Push notifications are not configured")
    return {"public_key": key}


@router.post("/subscriptions", status_code=204)
def save_subscription(
    payload: schemas.PushSubscriptionCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    endpoint = str(payload.endpoint)
    if not endpoint.startswith("https://") or not payload.keys.get("p256dh") or not payload.keys.get("auth"):
        raise HTTPException(400, "Invalid push subscription")

    subscription = db.query(models.PushSubscription).filter_by(endpoint=endpoint).first()
    if subscription:
        subscription.user_id = user.id
        subscription.p256dh = payload.keys["p256dh"]
        subscription.auth = payload.keys["auth"]
    else:
        db.add(models.PushSubscription(
            user_id=user.id,
            endpoint=endpoint,
            p256dh=payload.keys["p256dh"],
            auth=payload.keys["auth"],
        ))
    db.commit()
    return Response(status_code=204)


@router.delete("/subscriptions", status_code=204)
def delete_subscription(
    payload: schemas.PushSubscriptionDelete,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    db.query(models.PushSubscription).filter_by(endpoint=str(payload.endpoint), user_id=user.id).delete()
    db.commit()
    return Response(status_code=204)
