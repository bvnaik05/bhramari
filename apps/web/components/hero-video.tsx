"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { BeeMark } from "@/components/brand";

const mp4Source = "/media/sih-bhramari-1080p.mp4";

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const loadVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!loaded) {
      video.src = mp4Source;
      video.load();
      setLoaded(true);
    }
    return video;
  };

  const playVideo = () => {
    const video = loadVideo();
    if (!video) return;
    void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  const toggleVideo = () => {
    const video = loadVideo();
    if (!video) return;
    if (video.paused) {
      playVideo();
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const toggleFullscreen = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!frameRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await frameRef.current.requestFullscreen();
    }
  };

  const toggleMuted = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  return (
    <div
      ref={frameRef}
      className={`hero-video${playing ? " is-playing" : ""}`}
    >
      <video ref={videoRef} muted={muted} loop playsInline preload="none" aria-label="Bhramari film" onClick={toggleVideo} />
      {!playing && (
        <button className="hero-video-poster" type="button" onClick={playVideo} aria-label="Play the Bhramari film">
          <span className="hero-video-logo" aria-hidden="true">
            <span className="hero-video-logo-mark">
              <BeeMark />
            </span>
            <span>bhramari</span>
          </span>
          <span className="hero-video-poster-play" aria-hidden="true">
            <Play size={22} fill="currentColor" />
          </span>
        </button>
      )}
      <div className="hero-video-controls" aria-label="Video controls">
        <button type="button" onClick={toggleVideo} aria-label={playing ? "Pause the Bhramari film" : "Play the Bhramari film"}>
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
        <button type="button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Mute the Bhramari film"}>
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Open fullscreen"}>
          <Maximize2 size={16} />
        </button>
      </div>
      <span className="hero-video-caption">A short film about the hive</span>
    </div>
  );
}