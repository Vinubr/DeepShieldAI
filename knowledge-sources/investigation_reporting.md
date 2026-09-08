# Investigation, Evidence, Privacy, and Reporting

This guide outlines the operational procedures for handling media uploads, conducting forensic analysis, and reporting results.

## Standard Workflow

1. **Preserve**: Keep the original file unchanged.
2. **Record**: Document the filename, file type, file size, document ID, detector model, result, confidence, and processing time.
3. **Verify**: Confirm that the detector matches the actual media stream.
4. **Review**: Manually review unexpected or borderline results.
5. **Cross-Reference**: Compare the result with provenance, metadata, trusted sources, and independent checks.
6. **Report**: Report the result cautiously as a model classification rather than a proven fact.

## Operational Procedures

### 1. Intake and Preservation
- Create a working copy for conversion, frame extraction, or inspection.
- Record original filename, extension, MIME type, file size, upload time, and source URL.
- Record a cryptographic hash when chain-of-custody tracking is required.
- **Never overwrite the original with a converted audio or video file.**

### 2. Analysis
- Select the detector matching the actual media type.
- Record model name, predicted label, confidence, processing time, and explanation method.
- Repeat analysis only for a technical reason; repeated runs on the same file are not independent evidence.
- Escalate borderline, unexpected, poor-quality, or out-of-distribution files to human review.

### 3. Evidence Review
Compare the automated result with:
- File metadata and provenance.
- Timestamps and source history.
- Reverse-search results and trusted publications.
- Independent media inspection (relevant frames, waveform regions, highlighted text).
*Never rely on one score or explanation alone.*

### 4. Privacy and Ethics
- Process only files the user is authorized to analyze.
- Do not place private recordings, identity documents, personal conversations, or confidential material in shared knowledge sources without an approved retention and access policy.
- Delete uploaded files and indexed vectors when retention is no longer justified.

### 5. Reporting Language
Reports should identify the file, detector, result, confidence, known limitations, retrieved supporting sources, and whether human review occurred.
- **Recommended Phrasing**: "The detector classified this file as more likely fake."
- **Prohibited Phrasing**: Do not claim that an automated score proves fraud, identity, intent, or legal responsibility.
