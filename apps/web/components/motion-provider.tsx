"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

/* Scroll choreography for the whole site.

   Reveals are deliberately not a uniform fade-and-rise. Each kind describes
   what the content is: headings fill like a cell filling with honey, comb
   groups settle outward from their origin, and figures count up to their
   value. */

function splitWords(element: HTMLElement) {
  const text = element.textContent ?? "";
  element.textContent = "";
  return text.split(/(\s+)/).map((part) => {
    if (!part.trim()) {
      element.appendChild(document.createTextNode(part));
      return null;
    }
    const outer = document.createElement("span");
    outer.className = "word";
    const inner = document.createElement("span");
    inner.className = "word-inner";
    inner.textContent = part;
    outer.appendChild(inner);
    element.appendChild(outer);
    return inner;
  });
}

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const reduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motion === "off";

    if (reduced) {
      gsap.set("[data-reveal]", { opacity: 1, clearProps: "all" });
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    /* Lenis carries the page; ScrollTrigger reads its position rather than the
       native scroll so the two never disagree. */
    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      wheelMultiplier: 0.9,
      touchMultiplier: 1.6,
    });

    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      /* Headings fill from below, the way a cell fills. */
      gsap.utils.toArray<HTMLElement>('[data-reveal="fill"]').forEach((element) => {
        gsap.fromTo(
          element,
          { opacity: 1, clipPath: "inset(100% 0% 0% 0%)", y: 18 },
          {
            clipPath: "inset(-15% 0% 0% 0%)",
            y: 0,
            duration: 1.15,
            ease: "power3.out",
            scrollTrigger: { trigger: element, start: "top 88%" },
          },
        );
      });

      /* Groups of cells settle outward from where the comb was anchored. */
      gsap.utils.toArray<HTMLElement>('[data-reveal="settle"]').forEach((group) => {
        const cells = group.children.length ? Array.from(group.children) : [group];
        gsap.set(group, { opacity: 1 });
        gsap.fromTo(
          cells,
          { opacity: 0, y: 34, scale: 0.94, rotate: -1.4 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            rotate: 0,
            duration: 0.85,
            ease: "back.out(1.4)",
            stagger: { each: 0.07, from: "start" },
            scrollTrigger: { trigger: group, start: "top 85%" },
          },
        );
      });

      gsap.utils.toArray<HTMLElement>('[data-reveal="rise"]').forEach((element) => {
        gsap.fromTo(
          element,
          { opacity: 0, y: 26 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            ease: "power2.out",
            scrollTrigger: { trigger: element, start: "top 90%" },
          },
        );
      });

      /* Figures count to their value so the number reads as measured. */
      gsap.utils.toArray<HTMLElement>('[data-reveal="count"]').forEach((element) => {
        const final = Number(element.dataset.to ?? element.textContent ?? 0);
        const decimals = Number(element.dataset.decimals ?? 0);
        const counter = { value: 0 };
        gsap.set(element, { opacity: 1 });
        gsap.to(counter, {
          value: final,
          duration: 1.6,
          ease: "power2.out",
          scrollTrigger: { trigger: element, start: "top 92%" },
          onUpdate: () => {
            element.textContent = counter.value.toFixed(decimals);
          },
        });
      });

      /* The hero's one orchestrated moment: words rise out of the comb as the
         cells behind them finish building. */
      const heroWords = document.querySelector<HTMLElement>("[data-hero-words]");
      if (heroWords) {
        const lines = Array.from(heroWords.querySelectorAll<HTMLElement>("[data-hero-line]"));
        const inners = lines.flatMap((line) => splitWords(line).filter(Boolean)) as HTMLElement[];
        gsap.set(heroWords, { opacity: 1 });
        gsap.fromTo(
          inners,
          { yPercent: 118, rotate: 3 },
          {
            yPercent: 0,
            rotate: 0,
            duration: 1.25,
            ease: "expo.out",
            stagger: 0.055,
            delay: 0.35,
          },
        );
      }

      gsap.utils.toArray<HTMLElement>("[data-hero-step]").forEach((element, index) => {
        gsap.fromTo(
          element,
          { opacity: 0, y: 22 },
          { opacity: 1, y: 0, duration: 0.9, ease: "power2.out", delay: 0.85 + index * 0.12 },
        );
      });

      /* Anything parallaxed drifts against the scroll rather than with it. */
      gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((element) => {
        const depth = Number(element.dataset.parallax || 0.12);
        gsap.to(element, {
          yPercent: depth * -100,
          ease: "none",
          scrollTrigger: {
            trigger: element.parentElement ?? element,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.6,
          },
        });
      });
    });

    /* Fonts change line wrapping, which changes every trigger position. */
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => {
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, [pathname]);

  return <>{children}</>;
}
