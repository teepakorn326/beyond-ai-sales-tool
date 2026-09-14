# Visa Document Checker design system

Tokens and component previews for the internal document-review tool. Direction A "Ledger":
white cards on a cool off-white ground, 1px slate hairlines, 8px radius, blue reserved for
actions and navigation, semantic colour always paired with an icon and a label.

Rules the components encode:
- Confidence is a band (high / medium / low / unreadable), never a bar.
- The only batch action is "Confirm N high-confidence fields". There is no Confirm All.
- Pending and Warn never render green.
- Printed date values are never hidden behind a conversion.
- The passport is authoritative: name conflicts resolve by confirming the person or requesting a reissued document.
- Anything that contacts a student stops at an ApprovalCard and the ConfirmationDialog.

Full spec: https://claude.ai/code/artifact/41581151-b72c-4a80-9453-e60c872f61ad
