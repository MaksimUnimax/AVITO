from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
chat=(ROOT/'chatgpt_content.js').read_text(encoding='utf-8')
worker=(ROOT/'service_worker.js').read_text(encoding='utf-8')
manifest=(ROOT/'manifest.json').read_text(encoding='utf-8')
assert 'AUTOMATION_PROMPT_FORM_ERROR: "AF_CAPTURE_FORM_ERROR"' in chat
assert 'candidateHasReadyAssistantTurnCopy' in chat
assert 'PROMPT_FINAL_ASSISTANT_WITHOUT_WRITING_BLOCK' in chat
assert 'ASSISTANT_WRITING_BLOCK_REQUIRED' in worker
assert 'AF_CAPTURE_FORM_ERROR' in worker
assert 'Обычный текст и Markdown/code block намеренно не исполняются как команда.' in worker
assert 'Следующее сообщение пользователя может быть обычным текстом.' in worker
assert '"version": "1.0.35"' in manifest
print('v1.0.35 prompt form terminal gate PASS')
