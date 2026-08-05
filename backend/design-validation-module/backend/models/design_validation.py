"""
Design Validation Models — SQLAlchemy

INTEGRATION:
  1. Import `Base` from YOUR project's database module.
  2. Replace the line below:
       from server_py.database import Base
     with your project's Base, e.g.:
       from myapp.database import Base
  3. These models create two tables: `design_validations` and `validation_pages`.
  4. If you have an `applications` table, the ForeignKey on application_id will
     link to it. If you don't, remove the ForeignKey argument.
"""

from sqlalchemy import Column, String, Text, Float, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
import uuid

# --- ADAPT THIS IMPORT to your project's Base ---
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
