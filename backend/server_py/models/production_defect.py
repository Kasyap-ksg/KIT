from sqlalchemy import Column, String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from server_py.database import Base


class ProductionDefect(Base):
    """A defect that escaped to production. Each one is a teaching moment —
    we convert it into Gherkin scenarios that get permanently attached to the
    project's regression suite so the bug can never silently come back."""
    __tablename__ = "production_defects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    jira_key = Column(String(50), default="", index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, default="")
    repro_steps = Column(Text, default="")
    severity = Column(String(20), default="medium")  # critical, high, medium, low
    status = Column(String(30), default="captured")  # captured, generating, regression_added, archived
    source = Column(String(20), default="manual")  # manual, jira
    page_url = Column(String(1000), default="")
    attachment_path = Column(String(500), default="")
    rationale = Column(Text, default="")  # AI-generated "what this protects against"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RegressionLink(Base):
    """Link from a production defect to the regression test case that protects against it."""
    __tablename__ = "regression_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    defect_id = Column(UUID(as_uuid=True), ForeignKey("production_defects.id", ondelete="CASCADE"), nullable=False, index=True)
    test_case_id = Column(UUID(as_uuid=True), ForeignKey("test_cases.id", ondelete="CASCADE"), nullable=False, index=True)
    scenario_kind = Column(String(20), default="repro")  # repro, positive, edge
    created_at = Column(DateTime(timezone=True), server_default=func.now())
