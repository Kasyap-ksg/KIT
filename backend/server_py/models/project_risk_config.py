"""Per-project risk weight configuration."""
from datetime import datetime
import uuid

from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from server_py.database import Base


class ProjectRiskConfig(Base):
    __tablename__ = "project_risk_configs"

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    weights = Column(JSONB, nullable=False, default=dict)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
