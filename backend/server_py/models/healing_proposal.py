from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, func, JSON
from sqlalchemy.dialects.postgresql import UUID
import uuid
from server_py.database import Base


class HealingProposal(Base):
    """A governed self-healing proposal: AI suggests a fix for a broken selector,
    a human reviewer approves or rejects before the fix is applied to the test case.
    """
    __tablename__ = "healing_proposals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    test_case_id = Column(UUID(as_uuid=True), ForeignKey("test_cases.id", ondelete="SET NULL"), nullable=True)
    test_run_id = Column(UUID(as_uuid=True), ForeignKey("test_runs.id", ondelete="SET NULL"), nullable=True)

    test_case_title = Column(String(500), default="")
    scenario_name = Column(String(500), default="")
    application_name = Column(String(255), default="")

    # The failing artifact
    broken_action = Column(String(80), default="click")  # click, fill, selectRadio, ...
    broken_selector = Column(Text, default="")
    broken_value = Column(Text, default="")
    error_message = Column(Text, default="")
    dom_snippet = Column(Text, default="")
    page_url = Column(String(1000), default="")

    # AI-proposed fix
    proposed_selector = Column(Text, default="")
    proposed_action = Column(String(80), default="")
    proposed_value = Column(Text, default="")
    ai_reasoning = Column(Text, default="")
    ai_confidence = Column(Integer, default=0)  # 0-100
    risk_level = Column(String(20), default="medium")  # low, medium, high
    model = Column(String(80), default="")
    alternates = Column(JSON, default=list)  # [{selector, reason, confidence}]

    # Governance
    status = Column(String(30), default="pending")  # pending, approved, rejected, applied, failed
    reviewer = Column(String(120), default="")
    review_notes = Column(Text, default="")
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    applied_at = Column(DateTime(timezone=True), nullable=True)
    application_diff = Column(Text, default="")  # textual diff of test case patch
    source = Column(String(40), default="auto")  # auto, manual, demo

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
