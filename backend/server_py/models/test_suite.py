from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from server_py.database import Base


class TestSuite(Base):
    __tablename__ = "test_suites"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    suite_type = Column(String(50), nullable=False)  # sprint, module, integration, e2e, smoke, regression
    description = Column(Text, default="")
    status = Column(String(50), default="draft")  # draft, in_review, approved, executing, completed
    total_cases = Column(Integer, default=0)
    passed_cases = Column(Integer, default=0)
    failed_cases = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="test_suites")
    test_cases = relationship("TestCase", back_populates="test_suite", cascade="all, delete-orphan")
    chat_messages = relationship("ChatMessage", back_populates="test_suite", cascade="all, delete-orphan")


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_suite_id = Column(UUID(as_uuid=True), ForeignKey("test_suites.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, default="")
    preconditions = Column(Text, default="")
    steps = Column(Text, default="")
    expected_result = Column(Text, default="")
    priority = Column(String(20), default="medium")  # critical, high, medium, low
    status = Column(String(50), default="draft")  # draft, ready, executing, passed, failed, blocked
    category = Column(String(100), default="")
    gherkin_script = Column(Text, default="")
    playwright_code = Column(Text, default="")
    execution_result = Column(Text, default="")
    execution_log = Column(Text, default="")
    jira_story_key = Column(String(50), default="")
    gherkin_approved = Column(String(10), default="")
    self_healing_log = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    test_suite = relationship("TestSuite", back_populates="test_cases")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_suite_id = Column(UUID(as_uuid=True), ForeignKey("test_suites.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)  # user, assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    test_suite = relationship("TestSuite", back_populates="chat_messages")
