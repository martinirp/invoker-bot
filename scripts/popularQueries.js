// @ts-nocheck

/**
 * Lista de músicas populares (fallback sem IA)
 * Use este arquivo se não quiser usar Gemini
 */

const POPULAR_QUERIES = {
  global: [
    'The Weeknd Blinding Lights',
    'Billie Eilish Bad Guy',
    'Dua Lipa Levitating',
    'The Weeknd After Hours',
    'Post Malone Circles',
    'Ariana Grande Thank U Next',
    'Olivia Rodrigo Drivers License',
    'Ed Sheeran Shape of You',
    'The Chainsmokers Closer',
    'Sia Chandelier',
    'Marshmello Alone',
    'Calvin Harris Summer',
    'Avicii Wake Me Up',
    'David Guetta Titanium',
    'Kygo Firestone',
    'Major Lazer Lean On',
    'Justin Bieber Sorry',
    'Shawn Mendes Stitches',
    'Harry Styles Watermelon Sugar',
    'Khalid Location',
    'Juice WRLD Lucid Dreams',
    'Travis Scott Sicko Mode',
    'Post Malone Congratulations',
    'Lil Nas X Old Town Road',
    'Remix Lady Gaga Chromatica',
  ],
  
  hiphop: [
    'Drake God Plan',
    'Drake One Dance',
    'Kanye West Gold Digger',
    'Eminem Lose Yourself',
    'Jay-Z Dirt Off Your Shoulder',
    'Kendrick Lamar HUMBLE',
    'Nicki Minaj Anaconda',
    'Cardi B Bodak Yellow',
    'Travis Scott Astroworld',
    'Lil Baby Drip',
    'Gunna Drip Season 3',
    'Playboi Carti Magnolia',
    'Tyler the Creator EARFQUAKE',
    'Anderson .Paak Come Down',
    'J Cole No Role Modelz',
  ],

  kpop: [
    'BTS Dynamite',
    'BTS Butter',
    'BLACKPINK Dynamite',
    'TWICE Fancy',
    'EXO Growl',
    'Stray Kids God Menu',
    'NewJeans Hype Boy',
    'IVE I AM',
    'Seventeen God of Music',
    'Enhypen Blessed-Cursed',
  ],

  latin: [
    'Bad Bunny Tití',
    'Bad Bunny Dakiti',
    'J Balvin Mi Gente',
    'Reggaeton Despacito',
    'Farruko Pepas',
    'Maluma Hawái',
    'Rauw Alejandro Provenza',
    'Arcángel Ella Y Yo',
    'Tainy Ella Baila Sola',
    'Grupo Frontera Un x Uno',
  ],

  pop: [
    'Taylor Swift Anti-Hero',
    'Taylor Swift Lover',
    'Ariana Grande Break Up with Your Girlfriend',
    'Dua Lipa Don\'t Start Now',
    'Dua Lipa Physical',
    'Miley Cyrus Flowers',
    'Olivia Rodrigo good 4 u',
    'Tate McRae she\'s all i wanna be',
    'Sabrina Carpenter Nonsense',
    'Joji Slow It Down',
  ]
};

module.exports = POPULAR_QUERIES;
