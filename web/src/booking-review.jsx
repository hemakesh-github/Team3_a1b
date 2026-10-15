import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  useGuest,
  useApi,
  request,
  Field,
  LoadState,
  ErrorBox,
  stamp,
} from "./shared";

const TAGS = [
  "clean",
  "great_location",
  "friendly_host",
  "value_for_money",
  "noisy",
  "spacious",
  "poor_wifi",
  "amazing_view",
  "as_described",
  "responsive_host",
  "comfortable_beds",
  "parking_issues",
];

export function BookingReview({ booking }) {
  const { guestId, setGuestId } = useGuest();
  const path = `/bookings/${booking.id}/review`;
  const state = useApi(path);
  const [rating, setRating] = useState("");
  const [tags, setTags] = useState([]);
  const [comment, setComment] = useState("");
  const [saved, setSaved] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const review = saved || state.data;

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      setSaved(
        await request(path, "POST", {
          guest_id: guestId,
          rating: Number(rating),
          tags,
          comment,
        }),
      );
    } catch (failure) {
      setError(failure);
      if (failure.code === "REVIEW_EXISTS") state.reload();
    } finally {
      setPending(false);
    }
  }
  async function checkSavedReview() {
    setPending(true);
    try {
      setSaved(await request(path));
      setError(null);
    } catch {
      // Keep submission blocked until the unknown outcome is resolved by a successful read.
      setError(
        Object.assign(
          new Error(
            "Could not check your review. Please retry checking before submitting again.",
          ),
          { uncertain: true },
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="booking-review">
      <h2>{review ? "Review from this stay" : "Review your stay"}</h2>
      <LoadState state={state}>
        {review ? (
          <>
            <p role="status">Review submitted · {review.rating} / 5 stars</p>
            <p>
              {review.tags.map((tag) => tag.replaceAll("_", " ")).join(" · ")}
            </p>
            {review.comment && (
              <p className="review-comment">{review.comment}</p>
            )}
            <p className="muted">Submitted {stamp(review.created_at)}</p>
            <Link to={`/reviews?property_id=${booking.property_id}`}>
              View property review analytics →
            </Link>
          </>
        ) : guestId !== booking.guest_id ? (
          <>
            <p>Select {booking.guest_name} to review this completed stay.</p>
            <button onClick={() => setGuestId(booking.guest_id)}>
              Select booking guest
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <p>
              Your stay is complete. Share your experience with this property.
              You can submit one review per booking.
            </p>
            <fieldset
              disabled={pending || error?.uncertain}
              className="review-fields"
            >
              <Field label="Rating">
                <select
                  required
                  value={rating}
                  onChange={(event) => setRating(event.target.value)}
                >
                  <option value="">Choose a rating</option>
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {value} {value === 1 ? "star" : "stars"}
                    </option>
                  ))}
                </select>
              </Field>
              <fieldset className="review-tags">
                <legend>Feedback tags (optional)</legend>
                {TAGS.map((tag) => (
                  <label key={tag}>
                    <input
                      type="checkbox"
                      checked={tags.includes(tag)}
                      onChange={(event) =>
                        setTags(
                          event.target.checked
                            ? [...tags, tag]
                            : tags.filter((value) => value !== tag),
                        )
                      }
                    />
                    {tag.replaceAll("_", " ")}
                  </label>
                ))}
              </fieldset>
              <Field label="Your review (optional)">
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="What was your stay like?"
                />
              </Field>
              <p className="muted">{comment.length} / 2,000 characters</p>
              <button type="submit" className="primary">
                {pending ? "Submitting…" : "Submit review"}
              </button>
            </fieldset>
            <ErrorBox error={error} />
            {error?.uncertain && (
              <button
                type="button"
                disabled={pending}
                onClick={checkSavedReview}
              >
                {pending ? "Checking…" : "Check saved review"}
              </button>
            )}
          </form>
        )}
      </LoadState>
    </section>
  );
}
