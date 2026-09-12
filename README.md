# 말글 — AI 회의록

회의 음성을 하나의 Gemini Live WebSocket 연결로 전송해 원문과 번역을 수초 안에 보여주고, 회의가 끝나면 전체 녹음을 한 번 정밀 분석해 화자를 구분하는 웹앱입니다.

- 프런트엔드: GitHub Pages
- 화자 분리: Gemini `gemini-3.5-transcribe`
- 실시간 원문·번역: Gemini Live API `gemini-3.5-live-translate-preview`
- 종료 후 정밀 번역: Gemini `gemini-3.8-flash`
- 회의록 구조화: Gemini `gemini-3.8-flash`

회의 언어, 번역 언어, 1~8명의 화자 수를 선택할 수 있습니다. 녹음 중 현재 화자를 즉시 바꾸고 화자 이름과 각 발언의 화자를 수정할 수 있습니다. 회의가 끝나면 저장해 둔 전체 음성을 Files API에 한 번 업로드해 화자 분리를 다시 정리하며, 완성된 회의록은 원문만·번역만·원문과 번역으로 나누어 복사하거나 Markdown으로 저장할 수 있습니다.

사용자가 입력한 Gemini API 키는 브라우저 `localStorage`에만 저장되며 Google Gemini API로 직접 전송됩니다. 저장소에는 키를 보관하지 않습니다. 음성 파일은 처리 후 Files API에서 삭제를 요청합니다. 공용 기기에서는 사용하지 않는 것을 권장합니다.
