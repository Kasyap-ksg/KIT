from sqlalchemy import Column, String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from server_py.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    domain_id = Column(UUID(as_uuid=True), ForeignKey("domains.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    jira_project_key = Column(String(100), default="")
    jira_url = Column(String(500), default="")
    jira_connection_id = Column(UUID(as_uuid=True), ForeignKey("jira_connections.id", ondelete="SET NULL"), nullable=True)
    app_url = Column(String(500), default="")
    brd_document = Column(Text, default="")
    status = Column(String(50), default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    domain = relationship("Domain", back_populates="projects")
    jira_connection = relationship("JiraConnection", back_populates="projects")
    applications = relationship("Application", back_populates="project", cascade="all, delete-orphan")
    test_suites = relationship("TestSuite", back_populates="project", cascade="all, delete-orphan")
