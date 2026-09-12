# 말글 — AI 회의록

회의를 녹음하거나 음성 파일을 올리면 화자를 구분하고, 요약·핵심 논의·결정 사항·할 일을 자동으로 만드는 웹앱입니다.

- 프런트엔드: GitHub Pages
- 화자 분리: `gpt-4o-transcribe-diarize`
- 회의록 구조화: OpenAI Responses API

사용자가 입력한 OpenAI API 키는 브라우저 `localStorage`에만 저장되며 OpenAI API로 직접 전송됩니다. 저장소에는 키를 보관하지 않습니다. 공용 기기에서는 사용하지 않는 것을 권장합니다.
