from sqlalchemy import Column, String, Text, Float, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from server_py.database import Base


class DesignValidation(Base):
    __tablename__ = "design_validations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id = Column(UUID(as_uuid=True), ForeignKey("applications.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    figma_url = Column(String(1000), default="")
    app_url = Column(String(1000), default="")
    status = Column(String(50), default="pending")
    overall_score = Column(Float, nullable=True)
    summary = Column(Text, default="")
    figma_video_path = Column(String(500), default="")
    app_video_path = Column(String(500), default="")
    journey_mode = Column(String(20), default="deterministic")
    journey_steps = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ValidationPage(Base):
    __tablename__ = "validation_pages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    validation_id = Column(UUID(as_uuid=True), ForeignKey("design_validations.id", ondelete="CASCADE"), nullable=False)
    page_name = Column(String(255), nullable=False)
    figma_image_path = Column(String(500), default="")
    app_image_path = Column(String(500), default="")
    compliance_score = Column(Float, nullable=True)
    findings = Column(Text, default="")
    status = Column(String(50), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
