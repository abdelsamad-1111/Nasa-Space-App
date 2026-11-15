import { STORY_STEPS, type StoryStepId } from '../../brain/indicators';

interface Props {
  active: StoryStepId | null;
  onStep: (id: StoryStepId) => void;
}

export function StoryBar({ active, onStep }: Props) {
  return (
    <nav className="story" aria-label="User story">
      <ol>
        {STORY_STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              className={`story-step${active === s.id ? ' is-active' : ''}`}
              onClick={() => onStep(s.id)}
              title={s.help}
            >
              <span className="story-num num">{String(i + 1).padStart(2, '0')}</span>
              <span className="story-label">{s.label}</span>
            </button>
            {i < STORY_STEPS.length - 1 && (
              <span className="story-arrow" aria-hidden="true">→</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
