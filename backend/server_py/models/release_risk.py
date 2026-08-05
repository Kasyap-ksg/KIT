from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, func, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
from server_py.database import Base


class ReleaseRiskSnapshot(Base):
    """Point-in-time release risk score for a project. We snapshot rather than
    recompute on read so leadership sees a stable history line over time."""
    __tablename__ = "release_risk_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    score = Column(Integer, nullable=False)        # 0-100, higher = riskier
    band = Column(String(20), nullable=False)      # LOW / MEDIUM / HIGH
    recommendation = Column(String(80), nullable=False)  # "Safe to ship" / "Ship with caveats" / "Hold"
    reasons = Column(JSONB, default=list, nullable=False)
    # Each reason: {factor, label, weight, raw, contribution, band, detail}
    computed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    trigger = Column(String(40), default="manual", nullable=False)


Index("ix_risk_snapshots_project_computed_at", ReleaseRiskSnapshot.project_id, ReleaseRiskSnapshot.computed_at.desc())
