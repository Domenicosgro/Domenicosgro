import Anthropic from '@anthropic-ai/sdk';
import type { DocumentAnalysis, DocumentCategory } from '../types/index.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_CATEGORIES: DocumentCategory[] = [
  'rechnung',
  'vertrag',
  'bescheid',
  'versicherung',
  'steuer',
  'bank',
  'gesundheit',
  'behoerde',
  'schule',
  'wohnen',
  'arbeit',
  'sonstiges',
];

const SYSTEM_PROMPT = `Du bist ein Experte für die Analyse deutschsprachiger Dokumente.
Analysiere das übergebene Dokument und antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt (kein Markdown, keine Erklärungen).

Das JSON muss folgendes Schema haben:
{
  "title": "Kurzer, prägnanter Titel des Dokuments (max. 80 Zeichen)",
  "category": "<eine der erlaubten Kategorien>",
  "summary": "Kurze Zusammenfassung des Inhalts auf Deutsch (2-4 Sätze)",
  "dates": [
    {
      "label": "Beschreibung der Frist/des Datums",
      "date": "YYYY-MM-DD",
      "priority": "urgent|high|medium|low"
    }
  ],
  "tags": ["tag1", "tag2"]
}

Erlaubte Kategorien: rechnung, vertrag, bescheid, versicherung, steuer, bank, gesundheit, behoerde, schule, wohnen, arbeit, sonstiges

Prioritätsregeln für Fristen:
- urgent: Frist innerhalb von 7 Tagen
- high: Frist innerhalb von 30 Tagen
- medium: Frist innerhalb von 90 Tagen
- low: Frist weiter als 90 Tage entfernt oder allgemeines Datum

Extrahiere alle relevanten Fristen, Zahlungstermine, Abgabetermine und wichtige Daten.
Antworte nur mit JSON, nichts anderem.`;

// ─── Analyzer class ───────────────────────────────────────────────────────────

export class DocumentAnalyzer {
  private client: Anthropic;
  private model: string;

  constructor(apiKey?: string, model = 'claude-opus-4-6') {
    const key = apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY is required.');
    }
    this.client = new Anthropic({ apiKey: key });
    this.model = model;
  }

  /**
   * Analyze a document from base64-encoded content.
   * Supports PDF (via text extraction) and images.
   */
  async analyzeDocument(
    fileContent: string,
    mimeType: string,
    fileName: string,
  ): Promise<DocumentAnalysis> {
    const isImage = mimeType.startsWith('image/');
    const isPdf = mimeType === 'application/pdf';

    if (!isImage && !isPdf) {
      throw new Error(`Unsupported MIME type: ${mimeType}`);
    }

    let userContent: Anthropic.MessageParam['content'];

    if (isImage) {
      userContent = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType as
              | 'image/jpeg'
              | 'image/png'
              | 'image/gif'
              | 'image/webp',
            data: fileContent,
          },
        },
        {
          type: 'text',
          text: `Analysiere dieses Dokument (Dateiname: ${fileName}). Antworte nur mit dem JSON-Objekt.`,
        },
      ];
    } else {
      // For PDFs: send as base64 document
      userContent = [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: fileContent,
          },
        } as unknown as Anthropic.TextBlockParam,
        {
          type: 'text',
          text: `Analysiere dieses Dokument (Dateiname: ${fileName}). Antworte nur mit dem JSON-Objekt.`,
        },
      ];
    }

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    const raw = message.content[0];
    if (raw.type !== 'text') {
      throw new Error('Unexpected response type from Claude API.');
    }

    return this.parseAndValidate(raw.text, fileName);
  }

  /**
   * Analyze plain text (e.g. OCR output or extracted PDF text).
   */
  async analyzeText(
    text: string,
    fileName: string,
  ): Promise<DocumentAnalysis> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Analysiere folgenden Dokumententext (Dateiname: ${fileName}):\n\n${text}\n\nAntworte nur mit dem JSON-Objekt.`,
        },
      ],
    });

    const raw = message.content[0];
    if (raw.type !== 'text') {
      throw new Error('Unexpected response type from Claude API.');
    }

    return this.parseAndValidate(raw.text, fileName);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private parseAndValidate(raw: string, fileName: string): DocumentAnalysis {
    // Strip any accidental markdown code fences
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(
        `Claude returned invalid JSON for document "${fileName}": ${cleaned.slice(0, 200)}`,
      );
    }

    return this.validateSchema(parsed, fileName);
  }

  private validateSchema(data: unknown, fileName: string): DocumentAnalysis {
    if (typeof data !== 'object' || data === null) {
      throw new Error(`Analysis result is not an object for "${fileName}".`);
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj['title'] !== 'string' || !obj['title'].trim()) {
      obj['title'] = fileName;
    }

    if (!VALID_CATEGORIES.includes(obj['category'] as DocumentCategory)) {
      obj['category'] = 'sonstiges';
    }

    if (typeof obj['summary'] !== 'string') {
      obj['summary'] = '';
    }

    if (!Array.isArray(obj['dates'])) {
      obj['dates'] = [];
    } else {
      obj['dates'] = (obj['dates'] as unknown[]).filter(
        (d): d is { label: string; date: string; priority: string } =>
          typeof d === 'object' &&
          d !== null &&
          typeof (d as Record<string, unknown>)['label'] === 'string' &&
          typeof (d as Record<string, unknown>)['date'] === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(
            (d as Record<string, unknown>)['date'] as string,
          ),
      );
    }

    if (!Array.isArray(obj['tags'])) {
      obj['tags'] = [];
    } else {
      obj['tags'] = (obj['tags'] as unknown[]).filter(
        (t) => typeof t === 'string',
      );
    }

    return obj as unknown as DocumentAnalysis;
  }
}

// ─── Convenience factory ──────────────────────────────────────────────────────

let _analyzer: DocumentAnalyzer | null = null;

export function getAnalyzer(apiKey?: string): DocumentAnalyzer {
  if (!_analyzer) {
    _analyzer = new DocumentAnalyzer(apiKey);
  }
  return _analyzer;
}
