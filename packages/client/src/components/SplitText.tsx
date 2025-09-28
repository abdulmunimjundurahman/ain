import { useSprings, animated, SpringConfig } from '@react-spring/web';
import { useEffect, useRef, useState } from 'react';

interface SegmenterOptions {
  granularity?: 'grapheme' | 'word' | 'sentence';
  localeMatcher?: 'lookup' | 'best fit';
}

interface SegmentData {
  segment: string;
  index: number;
  input: string;
  isWordLike?: boolean;
}

interface Segments {
  [Symbol.iterator](): IterableIterator<SegmentData>;
}

interface IntlSegmenter {
  segment(input: string): Segments;
}

interface IntlSegmenterConstructor {
  new (locales?: string | string[], options?: SegmenterOptions): IntlSegmenter;
}

declare global {
  interface Intl {
    Segmenter: IntlSegmenterConstructor;
  }
}

interface SplitTextProps {
  text?: string;
  className?: string;
  delay?: number;
  animationFrom?: { opacity: number; transform: string };
  animationTo?: { opacity: number; transform: string };
  easing?: SpringConfig['easing'];
  threshold?: number;
  rootMargin?: string;
  textAlign?: 'left' | 'right' | 'center' | 'justify' | 'start' | 'end';
  direction?: 'ltr' | 'rtl' | 'auto';
  onLetterAnimationComplete?: () => void;
  onLineCountChange?: (lineCount: number) => void;
}

// RTL detection function
const isRTLText = (text: string): boolean => {
  if (!text) return false;
  // Arabic, Hebrew, Persian/Farsi, Urdu Unicode ranges
  const RTL_CHAR_REGEX = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return RTL_CHAR_REGEX.test(text);
};

const splitGraphemes = (text: string): string[] => {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new (Intl as typeof Intl & { Segmenter: IntlSegmenterConstructor }).Segmenter(
      'en',
      { granularity: 'grapheme' },
    );
    const segments = segmenter.segment(text);
    return Array.from(segments).map((s: SegmentData) => s.segment);
  } else {
    return [...text];
  }
};

const SplitText: React.FC<SplitTextProps> = ({
  text = '',
  className = '',
  delay = 100,
  animationFrom = { opacity: 0, transform: 'translate3d(0,40px,0)' },
  animationTo = { opacity: 1, transform: 'translate3d(0,0,0)' },
  easing = (t: number) => t,
  threshold = 0.1,
  rootMargin = '-100px',
  textAlign = 'center',
  direction = 'auto',
  onLetterAnimationComplete,
  onLineCountChange,
}) => {
  const isRTL = isRTLText(text);
  
  // For RTL languages (like Arabic), animate words instead of individual letters
  const words = text.split(' ');
  const letters = isRTL ? words : words.map(splitGraphemes).flat();
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const animatedCount = useRef(0);

  const [springs] = useSprings(
    letters.length,
    (i) => ({
      from: animationFrom,
      to: inView
        ? async (next) => {
            await next(animationTo);
            animatedCount.current += 1;
            if (animatedCount.current === letters.length && onLetterAnimationComplete) {
              onLetterAnimationComplete();
            }
          }
        : animationFrom,
      delay: i * delay,
      config: { easing },
    }),
    [inView, text, delay, animationFrom, animationTo, easing, direction, onLetterAnimationComplete],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (ref.current) {
            observer.unobserve(ref.current);
          }
        }
      },
      { threshold, rootMargin },
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  useEffect(() => {
    if (ref.current && inView) {
      const element = ref.current;
      setTimeout(() => {
        const lineHeight =
          parseInt(getComputedStyle(element).lineHeight) ||
          parseInt(getComputedStyle(element).fontSize) * 1.2;
        const height = element.offsetHeight;
        const lines = Math.round(height / lineHeight);

        if (onLineCountChange) {
          onLineCountChange(lines);
        }
      }, 100);
    }
  }, [inView, text, onLineCountChange]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <p
        ref={ref}
        className={`split-parent inline overflow-hidden ${className}`}
        style={{ 
          textAlign, 
          direction: direction === 'auto' ? undefined : direction, 
          whiteSpace: 'normal', 
          wordWrap: 'break-word' 
        }}
        aria-hidden="true"
      >
        {isRTL ? (
          // For RTL languages, animate complete words
          letters.map((word, index) => (
            <animated.span
              key={index}
              style={springs[index]}
              className="inline-block transform transition-opacity will-change-transform"
            >
              {word}
              {index < letters.length - 1 && (
                <span style={{ display: 'inline-block', width: '0.3em' }}>&nbsp;</span>
              )}
            </animated.span>
          ))
        ) : (
          // For LTR languages, animate individual letters
          words.map((word, wordIndex) => {
            const wordLetters = splitGraphemes(word);
            return (
              <span key={wordIndex} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
                {wordLetters.map((letter, letterIndex) => {
                  const index =
                    words.slice(0, wordIndex).reduce((acc, w) => acc + splitGraphemes(w).length, 0) + letterIndex;

                  return (
                    <animated.span
                      key={index}
                      style={springs[index]}
                      className="inline-block transform transition-opacity will-change-transform"
                    >
                      {letter}
                    </animated.span>
                  );
                })}
                {wordIndex < words.length - 1 && (
                  <span style={{ display: 'inline-block', width: '0.3em' }}>&nbsp;</span>
                )}
              </span>
            );
          })
        )}
      </p>
    </>
  );
};

export default SplitText;
