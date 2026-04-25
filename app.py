"""
NeuralStudy — DEMO Backend (No API Key Required)
=================================================
Uses smart text processing to generate summaries,
exam questions, and chat responses from uploaded notes.
Perfect for hackathon demos!

Run:
    pip install -r requirements.txt
    python app.py
"""

import io
import re
import json
import time
import random
import string
from collections import Counter
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS

try:
    import pdfplumber
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

app = Flask(__name__)
CORS(app)

MAX_FILE_SIZE = 10 * 1024 * 1024


# ═══════════════════════════════════════════════════════
#  TEXT PROCESSING ENGINE  (no AI needed)
# ═══════════════════════════════════════════════════════

def clean(text):
    """Basic text cleanup."""
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[^\x00-\x7F]+', ' ', text)
    return text.strip()


def split_sentences(text):
    """Split text into sentences."""
    raw = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in raw if len(s.strip()) > 25]


def get_keywords(text, top=20):
    """Extract top keywords by frequency (ignoring stopwords)."""
    stopwords = {
        'the','a','an','and','or','but','in','on','at','to','for','of','with',
        'is','are','was','were','be','been','being','have','has','had','do',
        'does','did','will','would','could','should','may','might','shall',
        'this','that','these','those','it','its','they','them','their','there',
        'which','who','what','when','where','how','if','then','so','as','by',
        'from','into','through','during','also','about','can','not','all','any',
        'each','both','more','most','other','some','such','than','too','very',
        'just','because','while','although','however','therefore','thus',
    }
    words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
    freq  = Counter(w for w in words if w not in stopwords)
    return [w for w, _ in freq.most_common(top)]


def score_sentence(sentence, keywords, position, total):
    """Score a sentence based on keywords and position."""
    words   = set(re.findall(r'\b[a-zA-Z]{3,}\b', sentence.lower()))
    kw_hits = sum(1 for k in keywords if k in words)
    length  = len(sentence.split())

    # Prefer sentences at start/end (intro/conclusion signal)
    pos_bonus = 1.5 if position < total * 0.2 else (1.2 if position > total * 0.8 else 1.0)

    # Penalise too-short or too-long sentences
    len_score = min(length / 20, 1.0) if length < 40 else 40 / length

    return kw_hits * pos_bonus * len_score


def extractive_summary(text, num_sentences=6):
    """Pick the most informative sentences from the text."""
    sentences = split_sentences(text)
    if not sentences:
        return "No content could be summarised from the uploaded notes."

    keywords = get_keywords(text, top=25)
    scored   = [
        (score_sentence(s, keywords, i, len(sentences)), i, s)
        for i, s in enumerate(sentences)
    ]
    top = sorted(scored, reverse=True)[:num_sentences]
    top.sort(key=lambda x: x[1])   # restore reading order
    return ' '.join(s for _, _, s in top)


def generate_questions(text, num=5):
    """
    Generate exam questions from the text using templates +
    extracted key terms, definitions, and concepts.
    """
    sentences = split_sentences(text)
    keywords  = get_keywords(text, top=30)
    questions = []

    # ── 1. Definition / explanation questions ──────────────
    def_patterns = [
        r'(?:is defined as|refers to|means that|is known as)\s+(.{10,80})',
        r'([A-Z][a-zA-Z\s]{3,30})\s+is\s+(?:a|an|the)\s+(.{10,60})',
    ]
    for sent in sentences:
        for pat in def_patterns:
            m = re.search(pat, sent)
            if m and len(questions) < 2:
                subject = sent.split(' is ')[0].strip()[:60] if ' is ' in sent else sent[:50]
                questions.append(f"Define and explain the concept of '{subject.strip()}' as described in the notes.")
                break

    # ── 2. Keyword-based "explain" questions ──────────────
    important = [k for k in keywords if len(k) > 5][:8]
    used = set()
    for kw in important:
        if len(questions) >= 3:
            break
        if kw not in used:
            used.add(kw)
            # Find the sentence that contains this keyword
            ctx = next((s for s in sentences if kw in s.lower()), None)
            if ctx:
                questions.append(f"Explain the role and significance of '{kw}' based on your study notes.")

    # ── 3. Process / sequence questions ───────────────────
    process_words = ['steps', 'process', 'procedure', 'method', 'stages', 'phases', 'cycle']
    for sent in sentences:
        if any(pw in sent.lower() for pw in process_words) and len(questions) < 4:
            questions.append(f"Describe the process or steps involved as outlined in the notes. Why is this sequence important?")
            break

    # ── 4. Compare/contrast ────────────────────────────────
    compare_words = ['however', 'whereas', 'unlike', 'contrast', 'difference', 'compared', 'while']
    for sent in sentences:
        if any(cw in sent.lower() for cw in compare_words) and len(questions) < 4:
            questions.append("Compare and contrast the key ideas presented in the notes. What are the main differences and similarities?")
            break

    # ── 5. Fill remaining with generic high-value questions
    fallbacks = [
        f"What are the three most important concepts covered in these notes and why are they significant?",
        f"How does the topic of '{important[0] if important else 'the main subject'}' relate to real-world applications?",
        f"Critically analyse the main argument or theory presented in the notes. What evidence supports it?",
        f"What are the key limitations or challenges associated with the topics discussed in the notes?",
        f"Summarise the main conclusions that can be drawn from these study notes in your own words.",
        f"If you had to teach this topic to someone else, what are the five key points you would cover?",
    ]
    for fb in fallbacks:
        if len(questions) >= num:
            break
        if fb not in questions:
            questions.append(fb)

    return questions[:num]


def answer_question(notes, question, history):
    """
    Smart keyword-matching chatbot that answers from the notes.
    Finds the most relevant passage and builds an answer.
    """
    q_words   = set(re.findall(r'\b[a-zA-Z]{3,}\b', question.lower()))
    sentences = split_sentences(notes)

    stopwords = {'what','when','where','which','who','how','why','does','did',
                 'can','the','and','for','are','was','were','this','that',
                 'with','from','about','tell','explain','describe','define'}
    q_keys = q_words - stopwords

    # Score each sentence by overlap with question keywords
    scored = []
    for i, sent in enumerate(sentences):
        s_words = set(re.findall(r'\b[a-zA-Z]{3,}\b', sent.lower()))
        overlap = len(q_keys & s_words)
        scored.append((overlap, i, sent))

    scored.sort(reverse=True)
    top_sents = [s for _, _, s in scored[:4] if _ > 0]

    if not top_sents:
        # Generic helpful fallback
        keywords = get_keywords(notes, 5)
        return (
            f"Based on the uploaded notes, I couldn't find a direct answer to your question. "
            f"The notes mainly cover topics related to: {', '.join(keywords[:5])}. "
            f"Try asking about one of these specific areas for a more detailed answer."
        )

    # Build a natural-sounding answer
    answer_parts = []

    # Greeting / intro line
    intros = [
        "Based on your study notes,",
        "According to the uploaded material,",
        "From the notes you've shared,",
        "The notes indicate that",
    ]
    answer_parts.append(random.choice(intros))
    answer_parts.append(" ")

    # Core content from top sentences
    answer_parts.append(top_sents[0])
    if len(top_sents) > 1:
        answer_parts.append(f" Furthermore, {top_sents[1].lower()}")
    if len(top_sents) > 2:
        answer_parts.append(f" It is also worth noting that {top_sents[2].lower()}")

    # Closing tip
    tips = [
        "\n\nWould you like me to elaborate on any specific aspect of this?",
        "\n\nFeel free to ask a follow-up question for more detail.",
        "\n\nThis is drawn directly from your uploaded notes. Ask me anything else!",
    ]
    answer_parts.append(random.choice(tips))

    return ''.join(answer_parts)


def stream_text(text, delay=0.015):
    """Yield text as SSE events, word by word for streaming effect."""
    words = text.split(' ')
    for i, word in enumerate(words):
        chunk = word + (' ' if i < len(words) - 1 else '')
        payload = json.dumps({"text": chunk})
        yield f"data: {payload}\n\n"
        time.sleep(delay + random.uniform(0, 0.01))
    yield "data: [DONE]\n\n"


# ═══════════════════════════════════════════════════════
#  ROUTES
# ═══════════════════════════════════════════════════════

@app.route("/api/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Empty filename"}), 400

    file.seek(0, 2); size = file.tell(); file.seek(0)
    if size > MAX_FILE_SIZE:
        return jsonify({"error": "File too large (max 10 MB)"}), 413

    try:
        name = file.filename.lower()
        if name.endswith(".pdf"):
            if not PDF_SUPPORT:
                return jsonify({"error": "PDF needs pdfplumber: pip install pdfplumber"}), 422
            text = ""
            with pdfplumber.open(io.BytesIO(file.read())) as pdf:
                for page in pdf.pages:
                    pt = page.extract_text()
                    if pt:
                        text += pt + "\n\n"
            text = text.strip()
        elif name.endswith((".txt", ".md")):
            text = file.read().decode("utf-8", errors="replace").strip()
        else:
            return jsonify({"error": "Unsupported file. Use .txt .pdf .md"}), 422

        if not text:
            return jsonify({"error": "No text extracted from file"}), 422

        return jsonify({"text": text, "length": len(text)})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/summarize", methods=["POST"])
def summarize():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "No text"}), 400

    summary = extractive_summary(clean(text), num_sentences=6)

    intro = (
        "Here is a concise summary of your study notes: "
    )
    full = intro + summary

    return Response(
        stream_with_context(stream_text(full, delay=0.02)),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@app.route("/api/questions", methods=["POST"])
def questions():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "No text"}), 400

    qs = generate_questions(clean(text), num=5)
    return jsonify({"questions": qs})


@app.route("/api/chat", methods=["POST"])
def chat():
    data     = request.get_json(silent=True) or {}
    notes    = (data.get("text")     or "").strip()
    question = (data.get("question") or "").strip()
    history  = data.get("history", [])

    if not notes:    return jsonify({"error": "No notes"}), 400
    if not question: return jsonify({"error": "No question"}), 400

    answer = answer_question(clean(notes), question, history)

    return Response(
        stream_with_context(stream_text(answer, delay=0.018)),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status":      "ok",
        "mode":        "demo (no API key needed)",
        "pdf_support": PDF_SUPPORT,
    })


if __name__ == "__main__":
    print("=" * 50)
    print("  NeuralStudy — DEMO MODE")
    print("  No API key needed!")
    print("  Running at http://127.0.0.1:5000")
    print("=" * 50)
    app.run(host="127.0.0.1", port=5000, debug=True, threaded=True)
