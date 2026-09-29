/**
 * Field evidence: photographs from the site, with an optional device location.
 *
 * What a photograph here can and cannot show is said on screen. It records
 * what someone chose to photograph; it does not prove where or when, who owns
 * the work, that it is finished, or that payments were right. The location is
 * only ever read when the person presses the button, and refusing it never
 * blocks the report.
 *
 * Photos are shrunk in the browser (longest side 900 px, JPEG) before upload,
 * checked again on the server, and served back only to people who can see the
 * work. They are never a public link.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useDraft } from "../../hooks";
import { ROLE_NAME, dateTime, newId } from "../../format";
import { href } from "../../router";
import { ReviewInline, ReviewTrail } from "./Reviews";
import { STAGES } from "./WorkLog";
import type { Evidence, ProjectDetail, Review } from "../../types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MAX_BYTES = 470_000;
const MAX_SIDE = 900;

export function EvidenceTab({
  project,
  publicView,
  geminiConfigured,
  onChanged,
}: {
  project: ProjectDetail;
  publicView: boolean;
  geminiConfigured: boolean;
  onChanged: () => void;
}) {
  const { user } = useAuth();

  if (publicView) {
    return (
      <div className="evidence-public">
        <section className="panel card-pad">
          <span className="kicker">Verify on the ground</span>
          <h2 className="serif card-title">
            Photographs come from the assigned field team.
          </h2>
          <p className="dim" style={{ lineHeight: 1.65 }}>
            The contractor and the field officer for a work can photograph it,
            add a note and the stage reached, and attach their phone's location
            if they choose. The Member of Parliament and the agency see every
            report and can ask for clarification or a site visit. Reports are
            private to that team, so none are shown here.
          </p>
          <ul className="limits" style={{ marginTop: 12 }}>
            <li>
              A photograph shows what someone chose to photograph. It does not
              prove where, when, or that the work is complete.
            </li>
            <li>
              Location is optional and only read when the person presses the
              button.
            </li>
            <li>
              Exact re-use of the same image file is detected. An edited copy
              would not be.
            </li>
          </ul>
          <a
            className="btn btn-primary"
            href={href("/signin", { role: "officer" })}
            style={{ marginTop: 14 }}
          >
            Try it with a sample field officer account
          </a>
        </section>
      </div>
    );
  }

  const canAdd = user?.role === "vendor" || user?.role === "officer";
  const canAct = user?.role === "mp" || user?.role === "agency";

  return (
    <div className="col" style={{ gap: 16 }}>
      {canAdd && <CaptureForm project={project} onSaved={onChanged} />}

      <section className="panel">
        <div className="panel-head">
          <span className="label">Field reports</span>
          <span className="label mono">{project.evidence.length}</span>
        </div>
        {project.evidence.length === 0 ? (
          <p className="faint card-pad">
            {canAdd
              ? "No photograph yet. Use the form above to add the first report."
              : "No field photograph has been submitted for this work yet."}
          </p>
        ) : (
          <div className="evidence-grid">
            {[...project.evidence].reverse().map((item) => (
              <EvidenceCard
                key={item.id}
                item={item}
                reviews={project.reviews.filter(
                  (r) => r.targetKind === "evidence" && r.targetId === item.id,
                )}
                canDescribe={canAdd}
                canAct={canAct}
                projectId={project.id}
                geminiConfigured={geminiConfigured}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

interface CaptureDraft {
  clientId: string;
  photo: string;
  note: string;
  stage: string;
  progress: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
}

function CaptureForm({
  project,
  onSaved,
}: {
  project: ProjectDetail;
  onSaved: () => void;
}) {
  const [draft, setDraft, clear, restored] = useDraft<CaptureDraft>(
    `evidence.${project.id}`,
    () => ({
      clientId: newId(),
      photo: "",
      note: "",
      stage: "Construction",
      progress: "",
      lat: null,
      lng: null,
      accuracy: null,
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [saved, setSaved] = useState<Evidence | null>(null);

  async function acceptPhoto(source: Blob) {
    setError(null);
    setPreparing(true);
    try {
      const photo = await shrink(source);
      setDraft((d) => ({ ...d, photo }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "That image could not be read. Try another photograph.",
      );
    } finally {
      setPreparing(false);
    }
  }

  function locate() {
    setLocationNote(null);
    if (!("geolocation" in navigator)) {
      setLocationNote(
        "This browser cannot share a location. You can still submit the report without one.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setDraft((d) => ({
          ...d,
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy),
        }));
      },
      (failure) => {
        setLocating(false);
        setLocationNote(
          failure.code === failure.PERMISSION_DENIED
            ? "Location permission was refused. That is fine: the report can be submitted without it."
            : failure.code === failure.TIMEOUT
              ? "The location took too long to find. Try again outdoors, or submit without it."
              : "The location is not available right now. You can submit without it.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(null);
    if (!draft.photo) return setError("Add a photograph first");
    if (draft.note.trim().length < 5)
      return setError(
        "Describe what the photograph shows (5 characters or more)",
      );
    const progress = draft.progress === "" ? undefined : Number(draft.progress);
    if (
      progress !== undefined &&
      (!Number.isInteger(progress) || progress < 0 || progress > 100)
    ) {
      return setError("Reported progress is a whole number from 0 to 100");
    }
    setBusy(true);
    try {
      const result = await api.addEvidence(project.id, {
        clientId: draft.clientId,
        photo: draft.photo,
        note: draft.note.trim(),
        stage: draft.stage || undefined,
        progress,
        lat: draft.lat ?? undefined,
        lng: draft.lng ?? undefined,
        accuracy: draft.accuracy ?? undefined,
      });
      clear();
      setSaved(result);
      setLocationNote(null);
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save. Your report is kept; try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel card-pad capture" onSubmit={submit}>
      <div
        className="row wrap"
        style={{ justifyContent: "space-between", gap: 8 }}
      >
        <h3 className="serif card-title">Add a field report</h3>
        <span className="faint small">
          Saved to this work, visible to its team only
        </span>
      </div>
      {restored && draft.photo && (
        <p className="info small">
          Your unsaved report was restored, photograph included.
        </p>
      )}

      <div className="capture-grid">
        <div className="capture-photo">
          {camera ? (
            <LiveCamera
              onCapture={(blob) => {
                setCamera(false);
                void acceptPhoto(blob);
              }}
              onClose={() => setCamera(false)}
              onError={(message) => {
                setCamera(false);
                setError(message);
              }}
            />
          ) : draft.photo ? (
            <img src={draft.photo} alt="The photograph about to be submitted" />
          ) : (
            <div className="capture-empty">
              {preparing ? (
                <span className="spinner" />
              ) : (
                <span className="faint">No photograph yet</span>
              )}
            </div>
          )}
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setCamera(true)}
              disabled={camera || busy}
            >
              Use the camera
            </button>
            <label className="btn btn-sm">
              Choose a photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (file.size > 15 * 1024 * 1024)
                    return setError(
                      "That file is over 15 MB. Choose a smaller photograph.",
                    );
                  void acceptPhoto(file);
                }}
              />
            </label>
            {draft.photo && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDraft((d) => ({ ...d, photo: "" }))}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="col" style={{ gap: 10, minWidth: 0 }}>
          <label className="field">
            <span className="label">What the photograph shows</span>
            <textarea
              className="input"
              rows={3}
              maxLength={3000}
              value={draft.note}
              onChange={(e) =>
                setDraft((d) => ({ ...d, note: e.target.value }))
              }
              placeholder="Plinth beam cast; shuttering still in place on the north side"
            />
          </label>
          <div className="row wrap" style={{ gap: 10 }}>
            <label className="field grow">
              <span className="label">Stage</span>
              <select
                className="select"
                value={draft.stage}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, stage: e.target.value }))
                }
              >
                {STAGES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field grow">
              <span className="label">Progress you see (%)</span>
              <input
                className="input mono"
                type="number"
                min={0}
                max={100}
                step={1}
                value={draft.progress}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, progress: e.target.value }))
                }
                placeholder="optional"
              />
            </label>
          </div>
          <div className="location-box">
            {draft.lat != null && draft.lng != null ? (
              <p className="small">
                Location attached:{" "}
                <span className="mono">
                  {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
                </span>
                , within about {draft.accuracy ?? "?"} m.{" "}
                <button
                  type="button"
                  className="link"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      lat: null,
                      lng: null,
                      accuracy: null,
                    }))
                  }
                >
                  Remove it
                </button>
              </p>
            ) : (
              <p className="small faint">
                No location attached. It is optional, and read only if you press
                the button.
              </p>
            )}
            <button
              type="button"
              className="btn btn-sm"
              onClick={locate}
              disabled={locating}
            >
              {locating ? "Finding location…" : "Attach my location"}
            </button>
            {locationNote && <p className="small warn-text">{locationNote}</p>}
          </div>
        </div>
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <div className="notice notice-ok" role="status">
          <strong>Report saved.</strong>
          {saved.flags.length > 0 && (
            <ul>
              {saved.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="row wrap" style={{ gap: 8 }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || preparing}
        >
          {busy && <span className="spinner" />}
          {busy ? "Submitting" : "Submit report"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={clear}
          disabled={busy}
        >
          Clear
        </button>
        <span className="faint small">
          A photograph does not prove location, date or completion. A person
          reviews it.
        </span>
      </div>
    </form>
  );
}

/** Shrink any image the browser can read into a JPEG under the server's limit. */
async function shrink(source: Blob): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source, {
      imageOrientation: "from-image",
    });
  } catch {
    throw new Error(
      "That file is not an image this browser can read. Use a JPEG or PNG photograph.",
    );
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the photograph.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.72, 0.62, 0.5, 0.4]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    const bytes = Math.floor(
      (url.length - "data:image/jpeg;base64,".length) * 0.75,
    );
    if (bytes <= MAX_BYTES) return url;
  }
  throw new Error(
    "The photograph is still too large after shrinking. Try a simpler shot.",
  );
}

function LiveCamera({
  onCapture,
  onClose,
  onError,
}: {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  // Held in a ref so a new callback from the parent does not reopen the camera.
  const report = useRef(onError);
  report.current = onError;

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      report.current(
        'This browser cannot open the camera here. Use "Choose a photo" instead; on a phone it opens the camera.',
      );
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((media) => {
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play();
        }
      })
      .catch((failure: DOMException) => {
        report.current(
          failure.name === "NotAllowedError"
            ? 'Camera permission was refused. Use "Choose a photo" instead.'
            : 'No camera could be opened. Use "Choose a photo" instead.',
        );
      });
    return () => {
      cancelled = true;
      // Always release the camera, or the light stays on after leaving.
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const element = video.current;
    if (!element || !element.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    canvas.getContext("2d")?.drawImage(element, 0, 0);
    canvas.toBlob((blob) => blob && onCapture(blob), "image/jpeg", 0.9);
  }

  return (
    <div className="live-camera">
      <video ref={video} playsInline muted aria-label="Camera preview" />
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={capture}
        >
          Take photograph
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
        >
          Close camera
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function EvidenceCard({
  item,
  reviews,
  canDescribe,
  canAct,
  projectId,
  geminiConfigured,
  onChanged,
}: {
  item: Evidence;
  reviews: Review[];
  canDescribe: boolean;
  canAct: boolean;
  projectId: string;
  geminiConfigured: boolean;
  onChanged: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let made: string | null = null;
    api
      .evidencePhoto(item.id)
      .then((objectUrl) => {
        made = objectUrl;
        if (!revoked) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch((err: Error) => setPhotoError(err.message));
    return () => {
      revoked = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [item.id]);

  return (
    <article className="evidence-card">
      <div className="evidence-photo">
        {url ? (
          <img src={url} alt={`Field photograph: ${item.note}`} />
        ) : photoError ? (
          <span className="field-error small">{photoError}</span>
        ) : (
          <span className="spinner" />
        )}
      </div>
      <div className="card-pad col" style={{ gap: 6 }}>
        <strong>{item.note}</strong>
        <small className="faint">
          {item.createdByName} · {ROLE_NAME[item.role]} ·{" "}
          {dateTime(item.createdAt)}
          {item.stage ? ` · ${item.stage}` : ""}
          {item.progress != null ? ` · ${item.progress}% reported` : ""}
        </small>
        {item.lat != null && item.lng != null ? (
          <small>
            Device location {item.lat.toFixed(5)}, {item.lng.toFixed(5)} (±
            {Math.round(item.accuracy ?? 0)} m, as the phone reported it).{" "}
            <a
              className="link"
              target="_blank"
              rel="noreferrer noopener"
              href={`https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lng}#map=16/${item.lat}/${item.lng}`}
            >
              Open map
            </a>
          </small>
        ) : (
          <small className="faint">No location attached.</small>
        )}
        <small className="faint mono" title={item.sha256}>
          File fingerprint {item.sha256.slice(0, 12)}…
        </small>
        {item.flags.length > 0 && (
          <ul className="flag-list">
            {item.flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        <VisionNote
          item={item}
          canDescribe={canDescribe}
          configured={geminiConfigured}
          onChanged={onChanged}
        />
        <ReviewTrail reviews={reviews} />
        {canAct && (
          <ReviewInline
            projectId={projectId}
            targetKind="evidence"
            targetId={item.id}
            onSaved={onChanged}
          />
        )}
      </div>
    </article>
  );
}

function VisionNote({
  item,
  canDescribe,
  configured,
  onChanged,
}: {
  item: Evidence;
  canDescribe: boolean;
  configured: boolean;
  onChanged: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (item.vision) {
    return (
      <div className="vision">
        <span className="kicker">Gemini description · needs human review</span>
        <div className="vision-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {item.vision.text}
          </ReactMarkdown>
        </div>
        <small className="faint">
          {item.vision.model}, {dateTime(item.vision.createdAt)}. A description
          of what is visible, not a verification.
        </small>
      </div>
    );
  }
  if (!canDescribe) return null;

  if (!configured) {
    return (
      <div className="vision vision-off">
        <span className="kicker">Gemini description</span>
        <p className="small">
          Not connected on this server, so no description is produced. An
          administrator can switch it on by setting GEMINI_API_KEY. The
          photograph is saved and a person can review it as it is.
        </p>
      </div>
    );
  }

  async function describe() {
    setBusy(true);
    setError(null);
    try {
      await api.describePhoto(item.id, consent);
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gemini could not describe this photograph",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vision">
      <span className="kicker">Gemini description</span>
      <label className="row small" style={{ gap: 8, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          I agree to send this photograph, its note and the work's description
          to Google Gemini for a description.
        </span>
      </label>
      <button
        type="button"
        className="btn btn-sm"
        disabled={!consent || busy}
        onClick={describe}
      >
        {busy ? "Asking Gemini…" : "Describe with Gemini"}
      </button>
      {error && <p className="field-error small">{error}</p>}
    </div>
  );
}
