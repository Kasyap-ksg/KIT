from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, func, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from server_py.database import Base


class TestRun(Base):
    __tablename__ = "test_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_case_id = Column(UUID(as_uuid=True), ForeignKey("test_cases.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    suite_id = Column(UUID(as_uuid=True), ForeignKey("test_suites.id", ondelete="SET NULL"), nullable=True, index=True)
    run_number = Column(Integer, default=1, nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    duration_ms = Column(Integer, default=0)
    status = Column(String(20), default="running", nullable=False)  # running, passed, failed, error
    total_scenarios = Column(Integer, default=0)
    passed_scenarios = Column(Integer, default=0)
    failed_scenarios = Column(Integer, default=0)
    total_steps = Column(Integer, default=0)
    errors = Column(Integer, default=0)
    video_path = Column(String(500), default="")
    triggered_by = Column(String(50), default="user")  # user, batch, schedule
    summary = Column(Text, default="")
    log_excerpt = Column(Text, default="")  # tail-trimmed log for quick previews
    full_log = Column(Text, default="")     # full execution log for forensic playback

    scenarios = relationship("TestRunScenario", back_populates="run", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("test_case_id", "run_number", name="uq_test_runs_case_run_number"),
    )


class TestRunScenario(Base):
    __tablename__ = "test_run_scenarios"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("test_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(500), nullable=False)
    status = Column(String(20), default="passed", nullable=False)  # passed, failed
    errors = Column(Integer, default=0)
    actions = Column(Integer, default=0)
    duration_ms = Column(Integer, default=0)
    order_index = Column(Integer, default=0)

    run = relationship("TestRun", back_populates="scenarios")


Index("ix_test_runs_started_at_desc", TestRun.started_at.desc())
