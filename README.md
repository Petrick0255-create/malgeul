# 말글 — AI 회의록

회의를 녹음하거나 음성 파일을 올리면 화자를 구분하고, 요약·핵심 논의·결정 사항·할 일을 자동으로 만드는 웹앱입니다.

- 프런트엔드: GitHub Pages
- 화자 분리: Gemini `gemini-3.5-transcribe`
- 회의록 구조화: Gemini `gemini-3.8-flash`

사용자가 입력한 Gemini API 키는 브라우저 `localStorage`에만 저장되며 Google Gemini API로 직접 전송됩니다. 저장소에는 키를 보관하지 않습니다. 음성 파일은 처리 후 Files API에서 삭제를 요청합니다. 공용 기기에서는 사용하지 않는 것을 권장합니다.
