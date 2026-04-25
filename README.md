# NeuralStudy — DEMO MODE (No API Key Needed!)

Works completely offline using smart text processing.
Perfect for hackathon demos!

---

## Run in 3 Commands (Windows)

Open CMD inside the project folder:

```cmd
pip install -r requirements.txt
cd backend
python app.py
```

Then double-click `frontend/index.html` — done!

---

## How It Works (No AI API)

| Feature          | How it works                                      |
|------------------|---------------------------------------------------|
| Upload           | Reads TXT, PDF, Markdown files                    |
| Summary          | Extracts top sentences using keyword scoring      |
| Exam Questions   | Generates questions from key terms & definitions  |
| Chat             | Finds most relevant passages to answer questions  |
| Streaming        | Word-by-word typing effect (simulated streaming)  |

---

## Supported Files
- `.txt` — Plain text
- `.md`  — Markdown
- `.pdf` — PDF (needs pdfplumber, included)
