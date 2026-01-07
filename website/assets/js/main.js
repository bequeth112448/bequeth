// Register GSAP Plugin
gsap.registerPlugin(ScrollTrigger);

/* Custom Cursor Logic Removed */

// Add hover effect to links and buttons (Simple scale effect instead of cursor)
// Removed detailed cursor interactions

// Sticky Header
window.addEventListener('scroll', () => {
    const header = document.querySelector('header');
    header.classList.toggle('scrolled', window.scrollY > 50);
});

// Scroll Spy
window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('section');
    const navLinks = document.querySelectorAll('.nav-link');

    let current = '';

    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        // Trigger around 1/3 visibility or offset for header
        if (window.scrollY >= (sectionTop - sectionHeight / 3)) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (current && link.getAttribute('href').includes(current)) {
            link.classList.add('active');
        }
    });
});

// Mobile Navigation
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');
const mobileNavLinks = document.querySelectorAll('.nav-link');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');

    // Burger Animation
    if (hamburger.classList.contains('active')) {
        gsap.to('.bar:nth-child(1)', { rotation: 45, y: 8, duration: 0.3 });
        gsap.to('.bar:nth-child(2)', { opacity: 0, duration: 0.3 });
        gsap.to('.bar:nth-child(3)', { rotation: -45, y: -8, duration: 0.3 });
    } else {
        gsap.to('.bar', { rotation: 0, y: 0, opacity: 1, duration: 0.3 });
    }
});

mobileNavLinks.forEach(link => {
    link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        gsap.to('.bar', { rotation: 0, y: 0, opacity: 1, duration: 0.3 });
    });
});

// GSAP Animations

// Hero Text Reveal
const heroTl = gsap.timeline();
heroTl.from('.reveal-text', {
    y: 50,
    opacity: 0,
    duration: 1,
    stagger: 0.2,
    ease: "power3.out"
});

// Scroll Animations for Sections
gsap.utils.toArray('.reveal-scroll').forEach(section => {
    gsap.from(section, {
        scrollTrigger: {
            trigger: section,
            start: "top 80%",
            toggleActions: "play none none reverse"
        },
        y: 50,
        opacity: 0,
        duration: 1,
        ease: "power3.out"
    });
});

// Skill Bars Animation
gsap.utils.toArray('.progress-bar').forEach(bar => {
    gsap.to(bar, {
        scrollTrigger: {
            trigger: bar,
            start: "top 90%",
        },
        width: bar.getAttribute('data-width'),
        duration: 1.5,
        ease: "power2.out"
    });
});

// Typing Effect
const phrases = ["Yazılım & Geliştirme", "HTML & CSS", "C# & C++"];
let phraseIndex = 0;
let charIndex = 0;
let isDeleting = false;
const typingText = document.querySelector('.typing-text');

function typeEffect() {
    if (!typingText) return;

    const currentPhrase = phrases[phraseIndex];

    if (isDeleting) {
        typingText.textContent = currentPhrase.substring(0, charIndex - 1);
        charIndex--;
    } else {
        typingText.textContent = currentPhrase.substring(0, charIndex + 1);
        charIndex++;
    }

    if (!isDeleting && charIndex === currentPhrase.length) {
        isDeleting = true;
        setTimeout(typeEffect, 2000);
    } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
        setTimeout(typeEffect, 500);
    } else {
        setTimeout(typeEffect, isDeleting ? 100 : 200);
    }
}
document.addEventListener('DOMContentLoaded', typeEffect);

// Particles.js Config (RED - Enhanced Persistence)
particlesJS("particles-js", {
    "particles": {
        "number": { "value": 80, "density": { "enable": true, "value_area": 800 } },
        "color": { "value": "#ff0033" },
        "shape": { "type": "circle" },
        "opacity": {
            "value": 0.8,
            "random": true,
            "anim": { "enable": true, "speed": 1, "opacity_min": 0.3, "sync": false }
        },
        "size": {
            "value": 4,
            "random": true,
            "anim": { "enable": false }
        },
        "line_linked": {
            "enable": true,
            "distance": 150,
            "color": "#ff0033",
            "opacity": 0.6,
            "width": 1.5
        },
        "move": {
            "enable": true,
            "speed": 3,
            "direction": "none",
            "random": false,
            "straight": false,
            "out_mode": "out",
            "bounce": false
        }
    },
    "interactivity": {
        "detect_on": "window", /* Critical: Detects mouse even over other elements */
        "events": {
            "onhover": { "enable": true, "mode": "repulse" }, /* Scatter effect */
            "onclick": { "enable": true, "mode": "push" }
        },
        "modes": {
            "grab": { "distance": 140, "line_linked": { "opacity": 1 } },
            "repulse": { "distance": 150, "duration": 0.4 },
            "push": { "particles_nb": 4 }
        }
    },
    "retina_detect": true
});

// Matrix Rain Effect (Hacker Background)
const canvas = document.getElementById('code-rain');
if (canvas) {
    const ctx = canvas.getContext('2d');

    // Make the canvas full width/height of the parent section
    const resizeCanvas = () => {
        const section = document.getElementById('about');
        canvas.width = section.offsetWidth;
        canvas.height = section.offsetHeight;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Initial call

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%';
    const fontSize = 14;
    const columns = canvas.width / fontSize;

    const drops = [];
    for (let x = 0; x < columns; x++) {
        drops[x] = 1;
    }

    function drawMatrix() {
        // Transparent black background for trail effect
        ctx.fillStyle = 'rgba(5, 5, 5, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#ff0033'; // Red text (Theme color)
        ctx.font = `${fontSize}px monospace`;

        for (let i = 0; i < drops.length; i++) {
            const text = letters.charAt(Math.floor(Math.random() * letters.length));
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);

            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    }

    setInterval(drawMatrix, 50);
}
