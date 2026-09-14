"""Agent layer: a LangGraph state machine that answers a sales user's question
about a case in Thai, using tools whose risk level is enforced in code.

    guardrail -> gather_case -> investigate <-> sufficiency -> propose_action
              -> human_interrupt -> respond_and_record

Models read and suggest. Code decides what a tool is allowed to do.
"""
