FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
# Dependencies first, for layer caching; the package itself is installed below.
RUN pip install --no-cache-dir "langgraph>=1.0,<2" "anthropic>=1.0" "httpx>=0.27" "pydantic>=2.9" "pyyaml>=6" \
    "fastapi>=0.115" "uvicorn[standard]>=0.32" "psycopg[binary,pool]>=3.2" "pgvector>=0.3" "boto3>=1.35"
COPY agent ./agent
RUN pip install --no-cache-dir --no-deps -e .
EXPOSE 8090
CMD ["uvicorn", "agent.api:app", "--host", "0.0.0.0", "--port", "8090"]
