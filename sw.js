const CACHE_NAME = 'learnita-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/main.js',
  '/game_guess.png',
  '/game_translate.png',
  '/game_sentence.png',
  '/game_grammar.png',
  '/game_hangman.png',
  '/game_number.png',
  '/game_color.png',
  '/game_animal.png',
  '/game_job.png',
  '/game_calendar.png',
  '/game_family.png',
  '/game_places.png',
  '/game_objects.png',
  '/game_clothes.png',
  '/game_adjectives.png',
  '/success.mp3',
  '/fail.mp3',
  '/click.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});