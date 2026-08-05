from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import uuid
from server_py.database import Base


class TestRunTriage(Base):
    __tablename__ = "test_run_triages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("test_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String(40), default="unknown", nullable=False)
    hypothesis = Column(Text, default="", nullable=False)
    confidence = Column(Integer, default=0, nullable=False)  # 0-100
    evidence = Column(JSONB, default=list, nullable=False)   # list of {line_no?, snippet, why}
    suggested_action = Column(String(40), default="investigate", nullable=False)
    suggested_action_detail = Column(Text, default="")
    model = Column(String(80), default="")
    error = Column(Text, default="")  # populated when triage itself failed
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("run_id", name="uq_test_run_triages_run_id"),
    )
