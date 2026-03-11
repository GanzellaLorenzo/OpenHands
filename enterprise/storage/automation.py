from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON
from storage.base import Base

# Use JSON with JSONB variant so models work on SQLite (tests) and PostgreSQL (prod)
_JsonType = JSON().with_variant(JSONB(), 'postgresql')


class Automation(Base):  # type: ignore
    """Model for storing automation definitions."""

    __tablename__ = 'automations'

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    org_id = Column(String, nullable=True)
    name = Column(String, nullable=False)
    enabled = Column(Boolean, nullable=False, server_default=text('TRUE'))
    config = Column(_JsonType, nullable=False)
    trigger_type = Column(String, nullable=False)
    file_store_key = Column(String, nullable=False)
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=text('CURRENT_TIMESTAMP'),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=text('CURRENT_TIMESTAMP'),
        onupdate=func.now(),
        nullable=False,
    )

    runs = relationship('AutomationRun', back_populates='automation', cascade='all, delete-orphan')

    __table_args__ = (
        Index('ix_automations_user_id', 'user_id'),
        Index('ix_automations_org_id', 'org_id'),
        Index('ix_automations_enabled_trigger', 'enabled', 'trigger_type'),
    )


class AutomationRun(Base):  # type: ignore
    """Model for storing automation run records."""

    __tablename__ = 'automation_runs'

    id = Column(String, primary_key=True)
    automation_id = Column(
        String,
        ForeignKey('automations.id', ondelete='CASCADE'),
        nullable=False,
    )
    event_id = Column(
        BigInteger,
        ForeignKey('automation_events.id'),
        nullable=True,
    )
    conversation_id = Column(String, nullable=True)
    status = Column(String, nullable=False, server_default=text("'PENDING'"))
    claimed_by = Column(String, nullable=True)
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    heartbeat_at = Column(DateTime(timezone=True), nullable=True)
    retry_count = Column(Integer, nullable=False, server_default=text('0'))
    max_retries = Column(Integer, nullable=False, server_default=text('3'))
    next_retry_at = Column(DateTime(timezone=True), nullable=True)
    event_payload = Column(_JsonType, nullable=True)
    error_detail = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=text('CURRENT_TIMESTAMP'),
        nullable=False,
    )

    automation = relationship('Automation', back_populates='runs')

    __table_args__ = (
        Index(
            'ix_automation_runs_claimable',
            'status',
            'next_retry_at',
            postgresql_where=text("status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= now())"),
        ),
        Index('ix_automation_runs_automation_id', 'automation_id'),
        Index(
            'ix_automation_runs_heartbeat',
            'heartbeat_at',
            postgresql_where=text("status = 'RUNNING'"),
        ),
    )
