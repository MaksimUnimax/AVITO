from pathlib import Path
import sys

p = Path(sys.argv[1])
s = p.read_text(encoding='utf-8')
checks = {
    'ordinary assistant extractor': 'function ordinaryAssistantPayloadText(section)' in s,
    'generic turn copy distinguished': 'semantic_turn_copy_button' in s and 'isGenericAssistantTurnCopySnapshot' in s,
    'no unconditional writing-block wait': 'if (!candidate.writing_block && !candidate.copy_ready)' in s,
    'payload extraction supports ordinary turn': 'confirmAssistantPayloadAndExtract(candidateSection, candidate)' in s,
    'ordinary turn diagnostic exists': 'PROMPT_ACCEPTED_FROM_STABLE_ASSISTANT_TURN_DOM' in s,
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    print('FAIL:', ', '.join(failed))
    raise SystemExit(1)
print('PASS:', ', '.join(checks))
