# AI-Generated Text and Automated Bot Detection Forensics

## 1. Large Language Model (LLM) Generation Dynamics
Generative language models (e.g. GPT-4, LLaMA, Claude, Mistral) synthesize text autoregressively by sampling next tokens from predictive conditional distributions $P(w_t \mid w_{<t})$.
To produce coherent, grammatically polished prose, decoding algorithms utilize nucleus sampling ($top-p$), temperature scaling ($T$), or top-$k$ truncation. These constraints inadvertently compress linguistic entropy, producing structural and vocabulary distributions distinctly different from human writing.

## 2. Core Quantitative Forensic Metrics
DeepShieldAI analyzes text assets across multiple quantitative dimensions:
1. **Shannon Lexical Entropy ($H$)**:
   $$\quad H = -\sum_{i=1}^{V} p(w_i) \log_2 p(w_i)$$
   Where $p(w_i)$ is the empirical probability of word $w_i$. Human writing exhibits rich vocabulary entropy ($H \ge 0.75$), drawing from specialized jargon, colloquialisms, and diverse synonyms. LLM generated text typically clusters around high-probability common words, producing compressed entropy scores ($H < 0.65$).
2. **Syntactic Cadence & Sentence Length Variance ($\sigma$)**:
   Human writers vary sentence cadence organically—interspersing short punchy clauses with long compound sentences. In contrast, bot text displays uniform sentence lengths ($\sigma < 2.5$).
3. **Type-Token Ratio (TTR)**:
   $$\quad TTR = \frac{\text{Unique Words}}{\text{Total Words}}$$
   Measures lexical diversity. A low TTR in long text reveals high thematic repetition.
4. **N-gram Structural Recurrence**:
   Automated text generators repeat multi-word transitional frames (e.g., "in conclusion", "it is important to note", "on the other hand") far more frequently than human authors.
5. **Colloquial and Idiosyncratic Human Markers**:
   Organic human text naturally includes informal colloquialisms ("honestly", "tbh", "actually"), rhetorical disfluencies, emotional emphasis, and minor grammatical quirks. Their complete absence in conversational or casual genres is a strong synthetic indicator.

## 3. DistilBERT DeepShield Architecture for Text Detection
DeepShieldAI fine-tunes DistilBERT (a distilled, high-speed variant of BERT with 6 transformer layers and 66 million parameters) for binary text classification:
- **Tokenization**: Uses WordPiece tokenization with a vocabulary of 30,522 tokens.
- **Sliding-Window Inference**: For text documents exceeding the model's base token limit (128 tokens), DeepShieldAI executes a sliding window with 50% stride across all tokens, pooling predictions to ensure that long essays, news articles, or reports are evaluated across their entire body.
- **Classification Head**: Dense linear layer mapping the `[CLS]` token contextual embedding to binary classes `Fake` (synthetic/bot-generated) vs `Real` (human-authored).
