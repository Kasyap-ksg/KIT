import os
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from uuid import UUID
from openai import OpenAI
from server_py.database import get_db
from server_py.models.test_suite import ChatMessage, TestSuite, TestCase

router = APIRouter(prefix="/api/chat", tags=["chat"])

client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY") or os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY", ""),
    base_url=os.environ.get("OPENAI_BASE_URL") or os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://api.openai.com/v1"),
)


class ChatRequest(BaseModel):
    message: str
    test_suite_id: str


SYSTEM_PROMPT = """You are KIT - Ksquare Intelligent Testing AI Assistant. You help QA engineers generate test scenarios and test cases.

When the user asks you to generate test cases, respond with a JSON array of test case objects. Each test case should have:
- title: A concise title for the test case
- description: Brief description of what's being tested
- preconditions: Any prerequisites needed
- steps: Step-by-step instructions (numbered list as string)
- expected_result: The expected outcome
- priority: One of "critical", "high", "medium", "low"
- category: A grouping category for the test case

Always wrap the JSON array in ```json code blocks when generating test cases.

When not generating test cases, respond naturally with helpful QA guidance, test strategy recommendations, or answer questions about testing best practices.

Be professional, thorough, and provide actionable test cases that cover edge cases, positive paths, negative paths, and boundary conditions."""


@router.get("/{suite_id}/messages")
def get_chat_messages(suite_id: UUID, db: Session = Depends(get_db)):
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.test_suite_id == suite_id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    return [
        {
            "id": str(m.id),
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]


@router.post("/send")
def send_message(data: ChatRequest, db: Session = Depends(get_db)):
    suite = db.query(TestSuite).filter(TestSuite.id == data.test_suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Test suite not found")

    user_msg = ChatMessage(
        test_suite_id=data.test_suite_id,
        role="user",
        content=data.message,
    )
    db.add(user_msg)
    db.commit()

    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.test_suite_id == data.test_suite_id)
        .order_by(ChatMessage.created_at)
        .all()
    )

    existing_cases = db.query(TestCase).filter(TestCase.test_suite_id == data.test_suite_id).all()
    context = f"Test Suite: {suite.name} (Type: {suite.suite_type})\n"
    if suite.description:
        context += f"Description: {suite.description}\n"
    if existing_cases:
        context += f"Existing test cases ({len(existing_cases)}):\n"
        for c in existing_cases[:10]:
            context += f"- {c.title} [{c.priority}] ({c.status})\n"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT + "\n\nContext:\n" + context},
    ]
    for m in history:
        messages.append({"role": m.role, "content": m.content})

    def generate():
        full_response = ""
        try:
            stream = client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                stream=True,
                max_completion_tokens=4096,
            )
            for chunk in stream:
                content = chunk.choices[0].delta.content if chunk.choices[0].delta.content else ""
                if content:
                    full_response += content
                    yield f"data: {json.dumps({'content': content})}\n\n"

            assistant_msg = ChatMessage(
                test_suite_id=data.test_suite_id,
                role="assistant",
                content=full_response,
            )
            db.add(assistant_msg)
            db.commit()

            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/parse-test-cases")
def parse_and_save_test_cases(data: dict, db: Session = Depends(get_db)):
    test_suite_id = data.get("test_suite_id")
    test_cases_data = data.get("test_cases", [])

    if not test_suite_id or not test_cases_data:
        raise HTTPException(status_code=400, detail="test_suite_id and test_cases are required")

    suite = db.query(TestSuite).filter(TestSuite.id == test_suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Test suite not found")

    created = []
    for tc in test_cases_data:
        case = TestCase(
            test_suite_id=test_suite_id,
            title=tc.get("title", "Untitled"),
            description=tc.get("description", ""),
            preconditions=tc.get("preconditions", ""),
            steps=tc.get("steps", ""),
            expected_result=tc.get("expected_result", ""),
            priority=tc.get("priority", "medium"),
            category=tc.get("category", ""),
        )
        db.add(case)
        created.append(case)

    db.commit()
    for c in created:
        db.refresh(c)

    cases = db.query(TestCase).filter(TestCase.test_suite_id == test_suite_id).all()
    suite.total_cases = len(cases)
    suite.passed_cases = sum(1 for c in cases if c.status == "passed")
    suite.failed_cases = sum(1 for c in cases if c.status == "failed")
    db.commit()

    return {
        "created": len(created),
        "test_cases": [
            {
                "id": str(c.id),
                "title": c.title,
                "description": c.description,
                "priority": c.priority,
                "status": c.status,
            }
            for c in created
        ],
    }
