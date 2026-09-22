# Deceptive Opinion Spam and Fake Review Detection

## 1. Deceptive Review Typology
Consumer and product review manipulation undermines trust in e-commerce, hospitality, and application marketplaces. Opinion spam is categorized into:
1. **Computer-Generated (CG) Reviews**: Reviews produced automatically by programmatic bots or large language models prompted with product feature lists. These reviews often read fluently but lack genuine product interaction details.
2. **Original / Authentic (OR) Reviews**: Genuine human reviews reflecting actual hands-on user experience, including specific situational context, idiosyncratic complaints, and natural user sentiment.
3. **Coordinated Human Astroturfing**: Human writers hired to submit fraudulent positive or negative reviews. While grammatically irregular, they often reuse promotional keyword clusters.

## 2. Linguistic and Stylistic Deception Cues
Forensic analysis reveals consistent markers distinguishing CG from OR reviews:
- **Lexical Diversity vs. Keyword Stuffing**: CG reviews repeat canonical product names, model designations, and feature keywords frequently to optimize search rankings, resulting in lower lexical diversity.
- **Sentiment Extremity & Dissonance**: CG reviews tend toward polar positive evaluations with hyperbolic language ("the best product ever invented", "absolutely life-changing"). They rarely mention nuanced trade-offs or minor flaws.
- **Absence of Tangible Context**: Authentic human reviews describe real-world context (e.g., "the package arrived with a crushed corner", "fits slightly tight around the collar", "used it on my 2018 Honda Civic"). CG reviews rely on generic abstractions ("high quality material", "exceeds all expectations").
- **Exclamation & Punctuation Patterns**: Excessive use of exclamation marks, capitalization, and emoji clusters is common in low-tier promotional astroturfing.

## 3. DeepShieldAI DistilBERT Review Classification Engine
DeepShieldAI deploys a specialized DistilBERT model fine-tuned on benchmark review fraud corpuses:
- **Model Parameters**: 6 Transformer encoder layers, 12 attention heads, 768 hidden dimension.
- **Label Mapping**: Internal classes correspond to `0 = CG` (Computer-Generated / Fake) and `1 = OR` (Original / Genuine).
- **Benchmark Performance**: Validated with an F1 score of ~0.973 on in-domain test splits.
- **Sliding Window Processing**: Reviews exceeding 256 tokens are processed via 128-token stride windows to prevent truncation bias.
- **Out-of-Distribution (OOD) Verification**: Because human spam can sometimes imitate generic wording, DeepShield combines neural model predictions with linguistic entropy scoring and n-gram repetition indexing to produce robust forensic evidence.
