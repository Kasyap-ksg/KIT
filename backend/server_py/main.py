import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from server_py.database import engine, Base, SessionLocal
from server_py.models import Domain, Project, Application, TestSuite, TestCase, ChatMessage, DesignValidation, ValidationPage
from server_py.routes.domains import router as domains_router
from server_py.routes.projects import router as projects_router
from server_py.routes.applications import router as applications_router
from server_py.routes.test_suites import router as test_suites_router
from server_py.routes.test_cases import router as test_cases_router
from server_py.routes.chat import router as chat_router
from server_py.routes.search import router as search_router
from server_py.routes.analytics import router as analytics_router
from server_py.routes.design_validation import router as design_validation_router
from server_py.routes.jira import router as jira_router
from server_py.routes.test_execution import router as test_execution_router
from server_py.routes.triage import router as triage_router
from server_py.routes.healing import router as healing_router
from server_py.routes.defects import router as defects_router
from server_py.routes.risk import router as risk_router
from server_py.routes.jira_connections import router as jira_connections_router
from server_py.routes.uploads import router as uploads_router

app = FastAPI(title="KIT - Ksquare Intelligent Testing", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.include_router(domains_router)
app.include_router(projects_router)
app.include_router(applications_router)
app.include_router(test_suites_router)
app.include_router(test_cases_router)
app.include_router(chat_router)
app.include_router(search_router)
app.include_router(analytics_router)
app.include_router(design_validation_router)
app.include_router(jira_router)
app.include_router(test_execution_router)
app.include_router(triage_router)
app.include_router(healing_router)
app.include_router(defects_router)
app.include_router(risk_router)
app.include_router(jira_connections_router)
app.include_router(uploads_router)


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "app": "KIT"}


def seed_data():
    db = SessionLocal()
    try:
        existing = db.query(Domain).first()
        if existing:
            return

        d1 = Domain(name="Financial Services", description="Banking and payment processing applications")
        d2 = Domain(name="E-Commerce Platform", description="Online retail and marketplace solutions")
        db.add_all([d1, d2])
        db.flush()

        p1 = Project(
            domain_id=d1.id, name="Core Banking API", description="RESTful API for core banking operations including accounts, transactions, and compliance",
            jira_project_key="CBANK", jira_url="https://jira.example.com/projects/CBANK", status="active",
        )
        p2 = Project(
            domain_id=d1.id, name="Payment Gateway", description="Integration layer for processing credit card and ACH payments",
            jira_project_key="PGWY", jira_url="https://jira.example.com/projects/PGWY", status="active",
        )
        p3 = Project(
            domain_id=d2.id, name="Product Catalog Service", description="Microservice for product management, inventory, and pricing",
            jira_project_key="PCAT", status="active",
        )
        db.add_all([p1, p2, p3])
        db.flush()

        a1 = Application(project_id=p1.id, name="Banking Web Portal", app_type="web", url="https://banking.example.com", description="Customer-facing web portal for banking operations")
        a2 = Application(project_id=p1.id, name="Banking Mobile App", app_type="mobile", description="iOS and Android mobile banking application")
        a3 = Application(project_id=p2.id, name="Payment API", app_type="api", url="https://api.payments.example.com", description="REST API for payment processing")
        a4 = Application(project_id=p3.id, name="Catalog Admin Panel", app_type="web", url="https://admin.catalog.example.com", description="Admin interface for product catalog management")
        db.add_all([a1, a2, a3, a4])
        db.flush()

        s1 = TestSuite(project_id=p1.id, name="Sprint 12 - Account Management", suite_type="sprint", description="Test cases for account creation and management features in Sprint 12", status="completed", total_cases=6, passed_cases=5, failed_cases=1)
        s2 = TestSuite(project_id=p1.id, name="Account Module Tests", suite_type="module", description="Comprehensive module-level tests for the accounts module", status="in_review", total_cases=4, passed_cases=3, failed_cases=1)
        s3 = TestSuite(project_id=p1.id, name="Banking E2E Flow", suite_type="e2e", description="End-to-end testing of complete banking workflows", status="draft")
        s4 = TestSuite(project_id=p2.id, name="Payment Processing Smoke", suite_type="smoke", description="Quick smoke tests for payment processing pipeline", status="approved", total_cases=3, passed_cases=3, failed_cases=0)
        s5 = TestSuite(project_id=p2.id, name="Payment Regression Suite", suite_type="regression", description="Full regression test suite for payment gateway", status="draft")
        s6 = TestSuite(project_id=p3.id, name="Catalog Integration Tests", suite_type="integration", description="Integration tests for catalog service with inventory and pricing", status="executing", total_cases=5, passed_cases=2, failed_cases=1)
        db.add_all([s1, s2, s3, s4, s5, s6])
        db.flush()

        cases = [
            TestCase(test_suite_id=s1.id, title="Create savings account with valid data", description="Verify that a new savings account can be created with all valid fields", preconditions="User is logged in with account creation permissions", steps="1. Navigate to Account Creation\n2. Select 'Savings' account type\n3. Fill in customer details\n4. Submit the form", expected_result="Account is created successfully with a unique account number", priority="critical", status="passed", category="Account Creation"),
            TestCase(test_suite_id=s1.id, title="Create account with missing required fields", description="Verify validation when required fields are empty", preconditions="User is on account creation page", steps="1. Leave all fields blank\n2. Click Submit", expected_result="Validation errors shown for all required fields", priority="high", status="passed", category="Account Creation"),
            TestCase(test_suite_id=s1.id, title="Account balance displays correctly after deposit", description="Verify balance updates after a deposit transaction", preconditions="Account exists with $0 balance", steps="1. Make a deposit of $500\n2. Navigate to account details\n3. Verify balance", expected_result="Balance shows $500.00", priority="critical", status="passed", category="Transactions"),
            TestCase(test_suite_id=s1.id, title="Transfer between own accounts", description="Test internal fund transfer", preconditions="User has two accounts with sufficient balance", steps="1. Select source account\n2. Select destination account\n3. Enter transfer amount $100\n4. Confirm transfer", expected_result="Source debited, destination credited by $100", priority="high", status="passed", category="Transactions"),
            TestCase(test_suite_id=s1.id, title="Account statement generation", description="Verify monthly statement can be downloaded", preconditions="Account has transactions", steps="1. Navigate to statements\n2. Select date range\n3. Click Download PDF", expected_result="PDF statement downloaded with correct transaction history", priority="medium", status="passed", category="Reporting"),
            TestCase(test_suite_id=s1.id, title="Close account with pending transactions", description="Verify account cannot be closed with pending transactions", preconditions="Account has a pending transaction", steps="1. Navigate to account settings\n2. Click Close Account\n3. Confirm closure", expected_result="Error: Cannot close account with pending transactions", priority="high", status="failed", category="Account Management"),

            TestCase(test_suite_id=s2.id, title="Account search by customer name", description="Search accounts using customer name filter", preconditions="Multiple accounts exist", steps="1. Go to Account Search\n2. Enter customer name\n3. Click Search", expected_result="Matching accounts listed", priority="medium", status="passed", category="Search"),
            TestCase(test_suite_id=s2.id, title="Account type filter", description="Filter accounts by type", preconditions="Accounts of different types exist", steps="1. Open account list\n2. Select filter by type\n3. Choose 'Savings'", expected_result="Only savings accounts shown", priority="medium", status="passed", category="Search"),
            TestCase(test_suite_id=s2.id, title="Account audit trail", description="Verify audit trail records all changes", preconditions="Account exists", steps="1. Make changes to account\n2. View audit trail", expected_result="All changes logged with timestamps and user info", priority="high", status="passed", category="Compliance"),
            TestCase(test_suite_id=s2.id, title="Concurrent account update handling", description="Test optimistic locking on concurrent updates", preconditions="Two sessions open for same account", steps="1. Open account in two sessions\n2. Update name in session 1\n3. Update name in session 2", expected_result="Session 2 gets conflict error", priority="critical", status="failed", category="Concurrency"),

            TestCase(test_suite_id=s4.id, title="Process credit card payment", description="Verify basic credit card payment flow", preconditions="Valid test card configured", steps="1. Submit payment request\n2. Verify authorization\n3. Check settlement", expected_result="Payment processed and settled successfully", priority="critical", status="passed", category="Payments"),
            TestCase(test_suite_id=s4.id, title="Payment decline handling", description="Verify declined card behavior", preconditions="Test card configured for decline", steps="1. Submit payment with decline card\n2. Check response", expected_result="Appropriate decline reason returned", priority="high", status="passed", category="Payments"),
            TestCase(test_suite_id=s4.id, title="Refund processing", description="Test refund for completed payment", preconditions="Completed payment exists", steps="1. Submit refund request\n2. Verify refund status", expected_result="Refund processed within 3 business days", priority="high", status="passed", category="Refunds"),

            TestCase(test_suite_id=s6.id, title="Product sync with inventory service", description="Verify product stock updates from inventory", preconditions="Inventory service running", steps="1. Update stock in inventory\n2. Check catalog product\n3. Verify stock count", expected_result="Catalog reflects inventory stock levels", priority="critical", status="passed", category="Integration"),
            TestCase(test_suite_id=s6.id, title="Price update propagation", description="Verify price changes propagate to catalog", preconditions="Product exists in catalog", steps="1. Update price in pricing service\n2. Check catalog listing", expected_result="Catalog shows updated price within 5s", priority="high", status="passed", category="Integration"),
            TestCase(test_suite_id=s6.id, title="Category hierarchy sync", description="Test category tree sync", preconditions="Categories defined in CMS", steps="1. Add new subcategory in CMS\n2. Trigger sync\n3. Check catalog", expected_result="New category appears in catalog hierarchy", priority="medium", status="failed", category="Integration"),
            TestCase(test_suite_id=s6.id, title="Product image CDN integration", description="Verify images served via CDN", preconditions="Product with images exists", steps="1. Upload product image\n2. Check CDN URL\n3. Verify image loads", expected_result="Image accessible via CDN URL", priority="medium", status="draft", category="Media"),
            TestCase(test_suite_id=s6.id, title="Search index update on product change", description="Verify search index reflects product updates", preconditions="Elasticsearch running", steps="1. Update product title\n2. Wait for index refresh\n3. Search for new title", expected_result="Updated product found in search", priority="high", status="draft", category="Search"),
        ]
        db.add_all(cases)
        db.commit()
        print("Seed data created successfully")
    except Exception as e:
        db.rollback()
        print(f"Seed data error: {e}")
    finally:
        db.close()


def _run_migrations():
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        inspector = inspect(engine)
        if "test_cases" in inspector.get_table_names():
            tc_cols = [c["name"] for c in inspector.get_columns("test_cases")]
            for col_name in ["gherkin_script", "playwright_code", "execution_result", "execution_log", "self_healing_log"]:
                if col_name not in tc_cols:
                    conn.execute(text(f"ALTER TABLE test_cases ADD COLUMN {col_name} TEXT DEFAULT ''"))
            for col_name in ["jira_story_key", "gherkin_approved"]:
                if col_name not in tc_cols:
                    conn.execute(text(f"ALTER TABLE test_cases ADD COLUMN {col_name} VARCHAR(50) DEFAULT ''"))
            conn.commit()
        if "projects" in inspector.get_table_names():
            proj_cols = [c["name"] for c in inspector.get_columns("projects")]
            if "app_url" not in proj_cols:
                conn.execute(text("ALTER TABLE projects ADD COLUMN app_url VARCHAR(500) DEFAULT ''"))
                conn.commit()
            if "jira_connection_id" not in proj_cols:
                conn.execute(text("ALTER TABLE projects ADD COLUMN jira_connection_id UUID REFERENCES jira_connections(id) ON DELETE SET NULL"))
                conn.commit()
        if "test_runs" in inspector.get_table_names():
            tr_cols = [c["name"] for c in inspector.get_columns("test_runs")]
            # Harden against drift from earlier partial schemas: add every column
            # the model expects if missing.
            tr_columns_to_add = [
                ("project_id", "UUID"),
                ("suite_id", "UUID"),
                ("run_number", "INTEGER NOT NULL DEFAULT 1"),
                ("finished_at", "TIMESTAMP WITH TIME ZONE"),
                ("duration_ms", "INTEGER DEFAULT 0"),
                ("total_scenarios", "INTEGER DEFAULT 0"),
                ("passed_scenarios", "INTEGER DEFAULT 0"),
                ("failed_scenarios", "INTEGER DEFAULT 0"),
                ("total_steps", "INTEGER DEFAULT 0"),
                ("errors", "INTEGER DEFAULT 0"),
                ("video_path", "VARCHAR(500) DEFAULT ''"),
                ("triggered_by", "VARCHAR(50) DEFAULT 'user'"),
                ("summary", "TEXT DEFAULT ''"),
                ("log_excerpt", "TEXT DEFAULT ''"),
                ("full_log", "TEXT DEFAULT ''"),
            ]
            for col_name, col_type in tr_columns_to_add:
                if col_name not in tr_cols:
                    conn.execute(text(f"ALTER TABLE test_runs ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
            conn.commit()
            existing_constraints = {c["name"] for c in inspector.get_unique_constraints("test_runs")}
            if "uq_test_runs_case_run_number" not in existing_constraints:
                # Best-effort: clean any pre-existing duplicates before applying the constraint.
                conn.execute(text(
                    "DELETE FROM test_runs a USING test_runs b "
                    "WHERE a.ctid < b.ctid AND a.test_case_id = b.test_case_id AND a.run_number = b.run_number"
                ))
                try:
                    conn.execute(text(
                        "ALTER TABLE test_runs ADD CONSTRAINT uq_test_runs_case_run_number "
                        "UNIQUE (test_case_id, run_number)"
                    ))
                except Exception as e:
                    print(f"Skipped adding uq_test_runs_case_run_number: {e}")
                conn.commit()
        if "test_run_scenarios" in inspector.get_table_names():
            trs_cols = [c["name"] for c in inspector.get_columns("test_run_scenarios")]
            for col_name, col_type in [
                ("status", "VARCHAR(20) DEFAULT 'passed' NOT NULL"),
                ("errors", "INTEGER DEFAULT 0"),
                ("actions", "INTEGER DEFAULT 0"),
                ("duration_ms", "INTEGER DEFAULT 0"),
                ("order_index", "INTEGER DEFAULT 0"),
            ]:
                if col_name not in trs_cols:
                    conn.execute(text(f"ALTER TABLE test_run_scenarios ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
            conn.commit()
        if "test_run_triages" in inspector.get_table_names():
            tt_cols = [c["name"] for c in inspector.get_columns("test_run_triages")]
            for col_name, col_type in [
                ("category", "VARCHAR(40) DEFAULT 'unknown' NOT NULL"),
                ("hypothesis", "TEXT DEFAULT '' NOT NULL"),
                ("confidence", "INTEGER DEFAULT 0 NOT NULL"),
                ("evidence", "JSONB DEFAULT '[]'::jsonb NOT NULL"),
                ("suggested_action", "VARCHAR(40) DEFAULT 'investigate' NOT NULL"),
                ("suggested_action_detail", "TEXT DEFAULT ''"),
                ("model", "VARCHAR(80) DEFAULT ''"),
                ("error", "TEXT DEFAULT ''"),
            ]:
                if col_name not in tt_cols:
                    conn.execute(text(f"ALTER TABLE test_run_triages ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
            conn.commit()
        if "design_validations" in inspector.get_table_names():
            cols = [c["name"] for c in inspector.get_columns("design_validations")]
            if "figma_video_path" not in cols:
                conn.execute(text("ALTER TABLE design_validations ADD COLUMN figma_video_path VARCHAR(500) DEFAULT ''"))
            if "app_video_path" not in cols:
                conn.execute(text("ALTER TABLE design_validations ADD COLUMN app_video_path VARCHAR(500) DEFAULT ''"))
            if "journey_mode" not in cols:
                conn.execute(text("ALTER TABLE design_validations ADD COLUMN journey_mode VARCHAR(20) DEFAULT 'deterministic'"))
            if "journey_steps" not in cols:
                conn.execute(text("ALTER TABLE design_validations ADD COLUMN journey_steps JSON"))
            conn.commit()


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    seed_data()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
