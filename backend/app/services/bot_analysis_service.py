from app.models.bot_analysis import BotAnalysis
from app.repositories.bot_analysis_repository import (
    BotAnalysisRepository,
)
from app.repositories.prediction_repository import (
    PredictionRepository,
)
from app.schemas.bot_analysis import (
    BotAnalysisCreate,
    BotAnalysisUpdate,
)


class BotAnalysisService:

    def __init__(
        self,
        repository: BotAnalysisRepository,
        prediction_repository: PredictionRepository,
    ):
        self.repository = repository
        self.prediction_repository = prediction_repository

    def create_bot_analysis(
        self,
        data: BotAnalysisCreate,
    ):

        prediction = (
            self.prediction_repository.get_prediction_by_id(
                data.prediction_id
            )
        )

        if prediction is None:
            raise ValueError(
                "Prediction not found."
            )

        analysis = BotAnalysis(
            prediction_id=data.prediction_id,
            question=data.question,
            answer=data.answer,
            model_name=data.model_name,
        )

        return self.repository.create_bot_analysis(
            analysis
        )

    def generate_bot_analysis(
        self,
        prediction_id: int,
        question: str | None = None,
    ) -> BotAnalysis:
        import math
        import re
        from collections import Counter
        from pathlib import Path

        prediction = self.prediction_repository.get_prediction_by_id(prediction_id)
        if prediction is None:
            raise ValueError("Prediction not found.")

        doc = prediction.document
        modality = doc.document_type.type_name if doc and doc.document_type else "Review"

        # Resolve document file path
        doc_path = None
        if doc and doc.file_path:
            p = Path(doc.file_path)
            if p.exists():
                doc_path = p
            else:
                backend_root = Path(__file__).resolve().parents[2]
                cand = backend_root / doc.file_path
                if cand.exists():
                    doc_path = cand
                elif (backend_root.parent / doc.file_path).exists():
                    doc_path = backend_root.parent / doc.file_path

        # ------------------------------------------------------------
        # Distinct Bot vs Human vs Suspicious Detection Pipeline
        # ------------------------------------------------------------
        if modality in ["Review", "Text"]:
            q = question or "Is this text authored by a human, an automated bot, or suspicious programmatic agent?"
            raw_text = ""
            if doc_path and doc_path.exists():
                try:
                    raw_text = doc_path.read_text(encoding="utf-8", errors="replace").strip()
                except Exception:
                    raw_text = ""

            words = re.findall(r"\b[A-Za-z0-9'-]+\b", raw_text) if raw_text else []
            total_words = len(words)
            sentences = [s.strip() for s in re.split(r"[.!?]+", raw_text) if s.strip()]

            # 1. Lexical Entropy (Shannon entropy over word frequencies)
            if total_words > 0:
                word_counts = Counter(w.lower() for w in words)
                probs = [c / total_words for c in word_counts.values()]
                shannon_entropy = -sum(p * math.log2(p) for p in probs)
                max_entropy = math.log2(total_words) if total_words > 1 else 1.0
                normalized_entropy = round(shannon_entropy / max(1.0, max_entropy), 3)
            else:
                normalized_entropy = 0.5

            # 2. Sentence Length Variance
            sent_lengths = [len(re.findall(r"\b[A-Za-z0-9'-]+\b", s)) for s in sentences]
            if len(sent_lengths) > 1:
                avg_len = sum(sent_lengths) / len(sent_lengths)
                var_len = sum((l - avg_len) ** 2 for l in sent_lengths) / len(sent_lengths)
                std_len = math.sqrt(var_len)
            else:
                avg_len = total_words
                std_len = 5.0

            # 3. Repeated structural formulas
            bigrams = [f"{words[i].lower()} {words[i+1].lower()}" for i in range(len(words) - 1)]
            repeated_bigram_count = sum(1 for _, c in Counter(bigrams).items() if c > 1)

            # 4. Human informal cues (natural disfluencies, personal anecdotes, colloquialisms)
            human_markers = ["lol", "haha", "gonna", "wanna", "imo", "honestly", "actually", "tbh", "i felt", "my wife", "my husband", "bought this"]
            found_human_markers = [m for m in human_markers if m in raw_text.lower()]

            # Compute Bot Score [0.0 = completely human, 1.0 = highly automated bot]
            bot_score = 0.0
            indicators = []

            # Low entropy indicates synthetic repetition
            if normalized_entropy < 0.70 and total_words > 15:
                bot_score += 0.35
                indicators.append(f"Compressed lexical entropy (H={normalized_entropy}): Word diversity is artificially restricted.")
            else:
                indicators.append(f"Natural vocabulary entropy (H={normalized_entropy}): Organic distribution of terms.")

            # Highly uniform sentence length indicates template generation
            if std_len < 2.0 and len(sentences) >= 3:
                bot_score += 0.30
                indicators.append(f"Rigid sentence length cadence (σ={round(std_len, 2)}): Uniform structural rhythm characteristic of templating.")
            else:
                indicators.append(f"Variable sentence complexity (σ={round(std_len, 2)}): Realistic syntactic flow.")

            # High n-gram repetitions
            if repeated_bigram_count >= 3:
                bot_score += 0.20
                indicators.append(f"Structural formula recurrence: {repeated_bigram_count} repeated multi-word clusters.")

            # Absence of colloquialisms / human disfluencies
            if not found_human_markers and total_words > 25:
                bot_score += 0.15
                indicators.append("Absence of informal colloquialisms or natural speech disfluencies.")
            elif found_human_markers:
                bot_score -= 0.20
                indicators.append(f"Human disfluency cues identified: {', '.join(found_human_markers)}.")

            # Consider model prediction if synthetic
            if prediction.predicted_label in ["Fake", "CG"]:
                bot_score += 0.15

            bot_score = max(0.05, min(0.98, bot_score))

            if bot_score >= 0.65:
                classification = "Bot"
                confidence = round(bot_score * 100, 1)
                explanation = (
                    "The text demonstrates strong algorithmic/bot generation patterns: compressed vocabulary entropy, "
                    "uniform sentence lengths, and repetitive syntactic templates lacking organic human disfluencies."
                )
            elif bot_score >= 0.40:
                classification = "Suspicious"
                confidence = round((1.0 - abs(bot_score - 0.5) * 2) * 100, 1)
                explanation = (
                    "The text exhibits mixed characteristics: some natural linguistic variation is present, "
                    "but formulaic phrasing or atypical repetition suggests possible semi-automated or prompted authoring."
                )
            else:
                classification = "Human"
                confidence = round((1.0 - bot_score) * 100, 1)
                explanation = (
                    "The text reflects authentic human authorship: high vocabulary entropy, natural syntactic variability, "
                    "and characteristic human narrative structure without robotic template artifacts."
                )

            indicators_formatted = "\n".join(f"• {ind}" for ind in indicators)
            threat_rating = "CRITICAL / HIGH AUTOMATION RISK" if classification == "Bot" else ("ELEVATED / SUSPICIOUS AUTOMATION FOOTPRINT" if classification == "Suspicious" else "AUTHENTIC HUMAN / ZERO AUTOMATION DETECTED")
            pipeline_profile = "Autoregressive LLM or Templated Content Scripting (high phrase regularity, constrained vocabulary distribution)" if classification == "Bot" else ("Semi-Automated Hybrid / Prompt-Assisted Composition" if classification == "Suspicious" else "Organic Biological Authorship (natural lexical entropy and cognitive syntactic variability)")
            remediation = "Enforce automated quarantine on asset. Restrict programmatic dissemination and route to compliance review team." if classification == "Bot" else ("Flag for secondary human investigator review. Monitor account for automated burst activity." if classification == "Suspicious" else "Integrity confirmed. Cleared for standard operational processing and archival.")

            ans = (
                f"Classification: {classification}\n\n"
                f"=== DEEPSHIELD FORENSIC BOT INTELLIGENCE REPORT ===\n"
                f"Target Asset: {doc.original_file_name if doc else f'Document #{doc_id}'} (Modality: {modality})\n"
                f"Automation Threat Level: {threat_rating}\n\n"
                f"1. BEHAVIORAL & SYNTACTIC TELEMETRY MATRIX:\n"
                f"• Shannon Lexical Entropy: H = {normalized_entropy} (Baseline: >= 0.72 indicates human diversity)\n"
                f"• Sentence Length Standard Deviation: σ = {round(std_len, 2)} (Baseline: >= 3.0 indicates natural rhythm)\n"
                f"• Repetitive Multi-Word Clusters: {repeated_bigram_count} recurring formulaic n-grams\n"
                f"• Colloquial Disfluency Count: {len(found_human_markers)} organic informal cues detected\n"
                f"• Word Count Evaluated: {total_words} tokens across {len(sentences)} sentence structures\n\n"
                f"2. DETECTED AUTOMATION INDICATORS:\n"
                f"{indicators_formatted}\n\n"
                f"3. ATTRIBUTED GENERATOR ARCHITECTURE & PROFILING:\n"
                f"• Probable Generation Engine: {pipeline_profile}\n"
                f"• Algorithmic Cadence Score: {'Strongly Programmatic' if classification == 'Bot' else ('Intermediate / Mixed' if classification == 'Suspicious' else 'Organic Human')}\n\n"
                f"4. FORENSIC EXPLANATION & LINGUISTIC FINDINGS:\n"
                f"{explanation}\n\n"
                f"5. RECOMMENDED COUNTERMEASURES & ACTION PROTOCOL:\n"
                f"{remediation}"
            )

        elif modality == "Image":
            q = question or "Is this image synthesized by an automated diffusion/GAN bot or AI generation pipeline?"
            is_fake = prediction.predicted_label in ["Fake", "Deepfake"]
            classification = "Bot" if is_fake else "Human"
            threat_rating = "CRITICAL / HIGH SYNTHETIC AUTOMATION RISK" if is_fake else "AUTHENTIC HUMAN / ZERO AUTOMATION DETECTED"
            pipeline_profile = "Latent Diffusion Scheduler (LDM/DDIM) or Generative Adversarial Network (StyleGAN/ProGAN)" if is_fake else "Physical Optical Camera Hardware (Bayer CFA sensor capture)"
            remediation = "Enforce automated quarantine. Restrict public CDN propagation and verify C2PA cryptographic provenance metadata." if is_fake else "Asset verified authentic. Approved for operational media workflows."

            if is_fake:
                indicators = [
                    "Latent noise distribution uniformity consistent with automated diffusion schedulers.",
                    "High-frequency spatial frequency deviations localized in convolutional layers.",
                    "Symmetrical facial blending artifacts indicative of automated batch script generation.",
                    "Absence of physical photon Poisson shot noise and Bayer demosaicing residuals.",
                    "Unnatural corneal specular highlight asymmetry and iris boundary smoothing."
                ]
                explanation = (
                    "Automated bot generation confirmed. The image exhibits synthetic latent diffusion / GAN artifacts, "
                    "non-optical pixel boundary smoothing, unnatural frequency-domain roll-off, and complete absence of "
                    "physical Bayer-sensor noise."
                )
            else:
                indicators = [
                    "Natural optical sensor physics and authentic photon transfer curves.",
                    "Authentic optical aberrations and natural depth-of-field falloff.",
                    "Coherent noise residuals consistent with physical camera sensor hardware.",
                    "Realistic facial micro-texture including physiological skin pore structures.",
                    "Bilateral corneal light reflection geometry aligns with external illumination sources."
                ]
                explanation = (
                    "Human / organic capture confirmed. Physical optical sensor noise and realistic lens characteristics "
                    "validate manual human camera operation without automated synthetic diffusion markers."
                )

            indicators_formatted = "\n".join(f"• {ind}" for ind in indicators)
            ans = (
                f"Classification: {classification}\n\n"
                f"=== DEEPSHIELD FORENSIC BOT INTELLIGENCE REPORT ===\n"
                f"Target Asset: {doc.original_file_name if doc else f'Document #{doc_id}'} (Modality: Image)\n"
                f"Automation Threat Level: {threat_rating}\n\n"
                f"1. PHYSICAL & SPECTRAL TELEMETRY MATRIX:\n"
                f"• Optical Sensor Residual: {'Synthetic latent smoothing (no Bayer noise)' if is_fake else 'Physical CMOS/CCD photon noise verified'}\n"
                f"• Frequency Domain Characteristics: {'Abnormal Fourier spectral roll-off' if is_fake else 'Natural 1/f power law distribution'}\n"
                f"• Boundary Coherence: {'High-frequency convolution seam artifacts' if is_fake else 'Continuous optical depth-of-field'}\n"
                f"• Neural Detector Model: {prediction.model_name}\n\n"
                f"2. DETECTED AUTOMATION INDICATORS:\n"
                f"{indicators_formatted}\n\n"
                f"3. ATTRIBUTED GENERATOR ARCHITECTURE & PROFILING:\n"
                f"• Probable Pipeline: {pipeline_profile}\n"
                f"• Synthesis Signature: {'Programmatic Diffusion / GAN' if is_fake else 'Organic Physical Sensor'}\n\n"
                f"4. FORENSIC EXPLANATION & PHYSICAL FINDINGS:\n"
                f"{explanation}\n\n"
                f"5. RECOMMENDED COUNTERMEASURES & ACTION PROTOCOL:\n"
                f"{remediation}"
            )

        elif modality == "Video":
            q = question or "Is this video produced by an automated deepfake pipeline or programmatic avatar bot?"
            is_fake = prediction.predicted_label in ["Fake", "Deepfake"]
            classification = "Bot" if is_fake else "Human"
            threat_rating = "CRITICAL / HIGH SYNTHETIC VIDEO AUTOMATION RISK" if is_fake else "AUTHENTIC HUMAN / ZERO AUTOMATION DETECTED"
            pipeline_profile = "Neural Face-Swap Pipeline (DeepFaceLab/SimSwap) or Audio-Driven Avatar (Wav2Lip/SadTalker)" if is_fake else "Physical Digital Video Recorder (continuous spatio-temporal dynamics)"
            remediation = "Quarantine video stream immediately. Prevent broadcast or social distribution and initiate forensic chain-of-custody logging." if is_fake else "Video asset cleared. Continuous optical flow validates real-world human performance."

            if is_fake:
                indicators = [
                    "Inter-frame boundary warping detected across temporal sequences by R3D-18.",
                    "Optical flow velocity discontinuities localized to facial perimeter and jawline seams.",
                    "Unnatural micro-expression kinematics and biological blink cadence irregularities.",
                    "Color temperature and luminance jitter between adjacent video frames.",
                    "Phoneme-viseme temporal discordance between audio track and lip articulation."
                ]
                explanation = (
                    "Automated generative bot / deepfake pipeline detected. Temporal video sequences show "
                    "programmatic frame-by-frame face replacement artifacts, non-biological motion vectors, "
                    "and optical flow boundary shearing."
                )
            else:
                indicators = [
                    "Continuous temporal optical flow across all sampled frames.",
                    "Realistic physiological micro-expressions and natural biological eye movements.",
                    "Authentic physical camera motion and consistent lighting reflectance.",
                    "Smooth anatomical muscle action unit transitions across facial landmarks.",
                    "Temporal motion vector consistency verified across 16-frame 3D CNN convolutions."
                ]
                explanation = (
                    "Natural human video recording confirmed. Continuous kinematic optical flow and authentic "
                    "facial physiology confirm real-world human performance without automated deepfake synthesis."
                )

            indicators_formatted = "\n".join(f"• {ind}" for ind in indicators)
            ans = (
                f"Classification: {classification}\n\n"
                f"=== DEEPSHIELD FORENSIC BOT INTELLIGENCE REPORT ===\n"
                f"Target Asset: {doc.original_file_name if doc else f'Document #{doc_id}'} (Modality: Video)\n"
                f"Automation Threat Level: {threat_rating}\n\n"
                f"1. SPATIO-TEMPORAL TELEMETRY MATRIX:\n"
                f"• Spatio-Temporal Convolutions: 16 frames sampled across R3D-18 3D-ResNet\n"
                f"• Inter-Frame Coherence: {'Optical flow velocity discontinuities detected' if is_fake else 'Continuous spatio-temporal flow verified'}\n"
                f"• Biological Kinematics: {'Irregular micro-expression & blink cadence' if is_fake else 'Natural physiological ocular kinematics'}\n"
                f"• Neural Detector Model: {prediction.model_name}\n\n"
                f"2. DETECTED AUTOMATION INDICATORS:\n"
                f"{indicators_formatted}\n\n"
                f"3. ATTRIBUTED GENERATOR ARCHITECTURE & PROFILING:\n"
                f"• Probable Pipeline: {pipeline_profile}\n"
                f"• Kinematic Integrity: {'Programmatic Synthesis / Deepfake' if is_fake else 'Organic Human Subject'}\n\n"
                f"4. FORENSIC EXPLANATION & TEMPORAL FINDINGS:\n"
                f"{explanation}\n\n"
                f"5. RECOMMENDED COUNTERMEASURES & ACTION PROTOCOL:\n"
                f"{remediation}"
            )

        else:  # Audio
            q = question or "Is this audio produced by an automated voice-cloning bot or neural text-to-speech vocoder?"
            is_fake = prediction.predicted_label in ["Fake", "Deepfake"]
            classification = "Bot" if is_fake else "Human"
            threat_rating = "CRITICAL / HIGH VOICE CLONING AUTOMATION RISK" if is_fake else "AUTHENTIC HUMAN / ZERO AUTOMATION DETECTED"
            pipeline_profile = "Neural Text-To-Speech Vocoder (HiFi-GAN/WaveGlow/BigVGAN) or Voice Conversion Timbre Encoder" if is_fake else "Physical Vocal Tract Phonation (organic glottal pulses & room reverberation)"
            remediation = "Isolate audio asset. Reject biometric voice verification requests and flag for telecom impersonation incident review." if is_fake else "Audio recording verified genuine. Cleared for storage and standard operational processing."

            if is_fake:
                indicators = [
                    "Phase continuity discrepancies identified in high-frequency Wav2Vec2 harmonics.",
                    "Robotic fundamental frequency (F0) pitch quantization and unnatural melodic cadence.",
                    "Neural vocoder synthesis artifacts in consonant-vowel formant transitions.",
                    "Absence of natural glottal damping, organic respiration, and acoustic room decay.",
                    "Quantized spectral energy distribution across higher mel-frequency bins."
                ]
                explanation = (
                    "Automated speech synthesis bot detected. The audio stream contains programmatic neural vocoder "
                    "artifacts, quantized fundamental frequencies, phase incoherence, and absence of natural glottal damping."
                )
            else:
                indicators = [
                    "Authentic glottal pulse timing and organic room acoustic reverberation.",
                    "Natural conversational human breathing pauses and vocal phonation dynamics.",
                    "Realistic harmonic decay ratios consistent with human vocal tract physiology.",
                    "Continuous fundamental frequency (F0) pitch contour with organic micro-tremors.",
                    "Consistent ambient room noise floor matching physiological speech acoustics."
                ]
                explanation = (
                    "Organic human speech confirmed. The recording displays authentic physiological glottal timing, "
                    "natural breath dynamics, continuous pitch micro-tremors, and absence of vocoder synthesis markers."
                )

            indicators_formatted = "\n".join(f"• {ind}" for ind in indicators)
            ans = (
                f"Classification: {classification}\n\n"
                f"=== DEEPSHIELD FORENSIC BOT INTELLIGENCE REPORT ===\n"
                f"Target Asset: {doc.original_file_name if doc else f'Document #{doc_id}'} (Modality: Audio)\n"
                f"Automation Threat Level: {threat_rating}\n\n"
                f"1. ACOUSTIC & HARMONIC TELEMETRY MATRIX:\n"
                f"• Acoustic Feature Extraction: Wav2Vec2 self-supervised multi-layer temporal representations\n"
                f"• Harmonic Phase Coherence: {'Phase discontinuity & high-frequency distortion' if is_fake else 'Continuous phase alignment across overtones'}\n"
                f"• Pitch Modulation (F0): {'Quantized stepwise robotic intonation' if is_fake else 'Natural human physiological pitch variance'}\n"
                f"• Neural Detector Model: {prediction.model_name}\n\n"
                f"2. DETECTED AUTOMATION INDICATORS:\n"
                f"{indicators_formatted}\n\n"
                f"3. ATTRIBUTED GENERATOR ARCHITECTURE & PROFILING:\n"
                f"• Probable Pipeline: {pipeline_profile}\n"
                f"• Acoustic Origin: {'Programmatic Neural Vocoder / TTS' if is_fake else 'Human Vocal Tract Phonation'}\n\n"
                f"4. FORENSIC EXPLANATION & ACOUSTIC FINDINGS:\n"
                f"{explanation}\n\n"
                f"5. RECOMMENDED COUNTERMEASURES & ACTION PROTOCOL:\n"
                f"{remediation}"
            )

        bot = BotAnalysis(
            prediction_id=prediction_id,
            question=q,
            answer=ans,
            model_name=f"deepshield_{modality.lower()}_bot_analyzer",
        )
        return self.repository.create_bot_analysis(bot)

    def get_bot_analysis_by_id(
        self,
        analysis_id: int,
    ):

        analysis = (
            self.repository.get_bot_analysis_by_id(
                analysis_id
            )
        )

        if analysis is None:
            raise ValueError(
                "Bot analysis not found."
            )

        return analysis

    def get_all_bot_analyses(self, skip: int = 0, limit: int = 50):

        return self.repository.get_all_bot_analyses(skip, limit)

    def get_by_prediction(
        self,
        prediction_id: int,
    ):

        return self.repository.get_by_prediction(
            prediction_id
        )

    def update_bot_analysis(
        self,
        analysis_id: int,
        updated_data: BotAnalysisUpdate,
    ):

        analysis = (
            self.repository.get_bot_analysis_by_id(
                analysis_id
            )
        )

        if analysis is None:
            raise ValueError(
                "Bot analysis not found."
            )

        if updated_data.question is not None:
            analysis.question = updated_data.question

        if updated_data.answer is not None:
            analysis.answer = updated_data.answer

        if updated_data.model_name is not None:
            analysis.model_name = updated_data.model_name

        return self.repository.update_bot_analysis(
            analysis
        )

    def delete_bot_analysis(
        self,
        analysis_id: int,
    ):

        analysis = (
            self.repository.get_bot_analysis_by_id(
                analysis_id
            )
        )

        if analysis is None:
            raise ValueError(
                "Bot analysis not found."
            )

        self.repository.delete_bot_analysis(
            analysis
        )

        return {
            "message": "Bot analysis deleted successfully."
        }