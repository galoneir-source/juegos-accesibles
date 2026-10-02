import type { Metadata } from 'next'

// Catálogo único de juegos: lo usan la portada (app/page.tsx), el sitemap
// (app/sitemap.ts) y el metadata de cada juego (app/<slug>/layout.tsx).
// Breakout y Mazmorra Oscura son HTML estáticos de public/games servidos en
// /breakout y /mazmorra-oscura mediante los rewrites de next.config.ts.
export const GAMES = [
  { id: 'hangman', category: 'palabras', href: '/hangman', label: 'Ahorcado', desc: 'Adivina la palabra secreta letra a letra usando el teclado.' },
  { id: 'memory-sonidos', category: 'audio', href: '/memory-sonidos', label: 'Memory de Sonidos', desc: 'Escucha la secuencia de sonidos y repítela en el mismo orden.' },
  { id: 'aventura-texto', category: 'aventuras', href: '/aventura-texto', label: 'Aventura de Texto', desc: 'Explora un mundo con comandos de texto como ir norte, tomar objeto.' },
  { id: 'casa-encantada', category: 'aventuras', href: '/casa-encantada', label: 'Casa Encantada', desc: 'Aventura de texto de terror. Explora la Mansión Voss, cuida tu vida y tu cordura, y derrota al Espectro del Amo para escapar.' },
  { id: 'aventura-espacio', category: 'aventuras', href: '/aventura-espacio', label: 'Aventura Espacial', desc: 'Explora la estación espacial UES Kronos con comandos de texto. Descubre qué le ocurrió a la tripulación y destruye al Vórtex Primario.' },
  { id: 'breakout', category: 'arcade', href: '/breakout', label: 'Breakout', desc: 'Rompe todos los bloques con la paleta. Usa las flechas para moverte y Espacio para lanzar.' },
  { id: 'rpg', category: 'arcade', href: '/mazmorra-oscura', label: 'Mazmorra Oscura', desc: 'RPG medieval accesible. Explora mazmorras con WASD, ataca con Espacio e interactúa con E.' },
  { id: 'mastermind', category: 'palabras', href: '/mastermind', label: 'Mastermind de Números', desc: 'Adivina el número secreto de 4 dígitos. Recibirás pistas: toros (posición correcta) y vacas (dígito correcto, posición incorrecta).' },
  { id: 'wordle', category: 'palabras', href: '/wordle', label: 'Wordle', desc: 'Adivina la palabra de 5 letras en 6 intentos. Verde = posición correcta, amarillo = letra presente, gris = letra ausente.' },
  { id: 'mates-rapidas', category: 'palabras', href: '/mates-rapidas', label: 'Matemáticas Rápidas', desc: 'Responde operaciones aritméticas antes de que se agote el tiempo. Elige entre tres niveles de dificultad.' },
  { id: 'laberinto-audio', category: 'audio', href: '/laberinto-audio', label: 'Laberinto de Audio', desc: 'Navega un laberinto guiándote solo por el sonido. La brújula de audio indica dirección y distancia a la salida. Usa las flechas o WASD para moverte.' },
  { id: 'anagramas', category: 'palabras', href: '/anagramas', label: 'Anagramas', desc: 'Se muestra una palabra con las letras desordenadas. Escribe la palabra original antes de que se agote el tiempo. Pide pistas si necesitas ayuda.' },
  { id: 'blackjack', category: 'cartas', href: '/blackjack', label: 'Blackjack', desc: 'Juego de cartas contra el dealer. Llega a 21 o acércate más que él sin pasarte. Teclas P, S y D para jugar.' },
  { id: 'gin-rummy', category: 'cartas', href: '/gin-rummy', label: 'Gin Rummy', desc: 'Juego de cartas clásico. Forma combinaciones (tríos o escaleras) con tus 10 cartas y llama cuando tengas 10 puntos sueltos o menos. Roba con M o D, descarta con 1-0 y R.' },
  { id: 'poker', category: 'cartas', href: '/poker', label: "Póker Texas Hold'em", desc: "Texas Hold'em contra la IA. Recibes 2 cartas y compites con 5 cartas comunitarias. Iguala, pasa o sube en cada ronda. F=retirarte, C=igualar/pasar, R=subir. Empieza con 1000 fichas." },
  { id: 'truco', category: 'cartas', href: '/truco', label: 'Truco', desc: 'Truco argentino 1 contra 1. Mazo español de 40 cartas, 3 bazas por mano. Canta Envido (E) antes de la primera baza y Truco (T) en cualquier momento. Primero en llegar a 15 puntos gana.' },
  { id: 'parchis', category: 'mesa', href: '/parchis', label: 'Parchís', desc: 'Parchís 1 contra 1. 4 fichas cada jugador (rojas tú, azules la IA). Lanza el dado con R, elige ficha con 1-4. Saca un 5 para salir de casa. Seis y capturas dan turno extra. Gana quien meta las 4 fichas primero.' },
  { id: 'pong-audio', category: 'audio', href: '/pong-audio', label: 'Pong de Audio', desc: 'Pong totalmente accesible por sonido. La posición de la pelota se indica con sonido estéreo y tono. Usa las flechas o W S para mover tu paleta.' },
  { id: 'batalla-naval', category: 'mesa', href: '/batalla-naval', label: 'Batalla Naval', desc: 'Hunde la flota enemiga disparando en un tablero de 10×10. Coloca tus barcos con el teclado y recibe feedback sonoro: explosión para impactos, chapoteo para fallos.' },
  { id: 'penaltis', category: 'arcade', href: '/penaltis', label: 'Penaltis', desc: 'Tanda de 5 penaltis. Elige izquierda, centro o derecha para disparar o defender. El portero rival se adapta a tu historial de tiros.' },
  { id: 'tres-en-raya', category: 'mesa', href: '/tres-en-raya', label: 'Tres en Raya', desc: 'Juega al tres en raya contra la IA. Mueve el cursor con las flechas y coloca tu marca con Enter. La IA juega de forma óptima.' },
  { id: 'gorillas', category: 'arcade', href: '/gorillas', label: 'Gorilas', desc: 'El clásico Gorillas.bas. Introduce el ángulo y la velocidad para lanzar un plátano explosivo al gorila enemigo. El viento complica la puntería. Partida al mejor de 3 rondas.' },
  { id: 'misterio', category: 'aventuras', href: '/misterio', label: 'Detective: El Caso Blackwood', desc: 'Juego de misterio detectivesco. Lord Blackwood ha sido hallado muerto envenenado. Interroga a los cinco sospechosos, examina la escena del crimen y acusa al culpable.' },
  { id: 'secuencias', category: 'audio', href: '/secuencias', label: 'Secuencias', desc: 'Puente de plataformas de cristal. Escucha los tonos antes de saltar: agudo = seguro, grave = peligroso. Memoriza la secuencia y cruza el puente. 3 dificultades: 5, 8 o 12 saltos.' },
  { id: 'conecta4', category: 'mesa', href: '/conecta-cuatro', label: 'Conecta 4', desc: 'Coloca fichas amarillas para conectar 4 en línea (horizontal, vertical o diagonal) antes que la IA. Usa las flechas para mover entre columnas y Enter para soltar la ficha.' },
  { id: 'generala', category: 'cartas', href: '/generala', label: 'Generala', desc: '13 turnos, 5 dados, hasta 3 tiradas por turno. Rellena categorías como Escalera, Full, Póker o Generala para acumular la mayor puntuación posible. R para tirar, 1-5 para guardar dados, ↑↓ y Enter para anotar.' },
  { id: '2048', category: 'puzles', href: '/2048', label: '2048', desc: 'Desliza las fichas numéricas con las flechas para fusionarlas. Cuando dos fichas iguales chocan se combinan en una sola. Llega a la ficha 2048.' },
  { id: 'bingo', category: 'cartas', href: '/bingo', label: 'Bingo', desc: 'Cartón de 5×5 con números del 1 al 75. Las bolas se cantan con su letra (B, I, N, G, O) y los números de tu cartón se marcan solos. Pulsa Espacio para pedir cada bola. Gana con una línea o el Bingo completo.' },
  { id: 'aventura-magica', category: 'aventuras', href: '/aventura-magica', label: 'El Cristal Eterno', desc: 'Aventura medieval fantástica. El Dragón de las Sombras ha destruido el Cristal Eterno. Recorre el reino de Eloria, reúne los 3 Fragmentos y derrota al Dragón. Elige entre Paladín, Hechicera o Ladrón.' },
  { id: 'pirata', category: 'aventuras', href: '/pirata', label: 'El Tesoro del Corsario Negro', desc: 'Aventura pirata de texto. Explora 49 zonas de la Isla Maldita, recoge tesoros y derrota al Corsario Negro para quedarte con el Gran Tesoro. Elige entre Capitán, Bruja del Mar o Navegante.' },
  { id: 'egipto', category: 'aventuras', href: '/egipto', label: 'La Maldición del Faraón', desc: 'Aventura de texto en el antiguo Egipto. Explora 49 cámaras de la tumba de Amenhotep III, esquiva trampas y derrota al espíritu inmortal del faraón. Elige entre Arqueóloga, Sacerdote de Ra o Ladrón de tumbas.' },
  { id: 'samurai', category: 'aventuras', href: '/samurai', label: 'El Honor del Samurái', desc: 'Aventura de texto en el Japón feudal. Explora 49 estancias del castillo Kurogane, derrota al Shogun usurpador y restaura el honor del feudo. Elige entre Samurái, Ninja o Monje guerrero.' },
  { id: 'vikingos', category: 'aventuras', href: '/vikingos', label: 'La Furia del Jarl', desc: 'Aventura de texto en el norte vikingo. Explora 49 salas del fortín Haraldur, derrota al Jarl Oscuro y libera al clan de la maldición de Loki. Elige entre Guerrero Vikingo, Escaldo o Berserker.' },
  { id: 'abismo', category: 'aventuras', href: '/abismo', label: 'Las Ruinas del Abismo', desc: 'Aventura de texto en las profundidades oceánicas. Explora 49 zonas de unas ruinas sumergidas, descubre sus secretos y derrota al Leviatán del Abismo. Elige entre Comandante, Bióloga Marina o Explorador de Profundidades.' },
  { id: 'zona', category: 'aventuras', href: '/zona', label: 'La Zona Muerta', desc: 'Aventura de texto postapocalíptica. Explora 49 zonas del páramo devastado, sobrevive a raiders y mutantes, y derrota al Señor de la Zona. Elige entre Soldado, Médica de Campo o Saqueador.' },
  { id: 'castillo', category: 'aventuras', href: '/castillo', label: 'La Maldición del Conde', desc: 'Aventura de texto de terror gótico. Explora 49 estancias del castillo maldito del Conde Vordrak, descubre sus secretos y exorciza a su espíritu inmortal. Elige entre Cazador de Vampiros, Médium o Alquimista.' },
  { id: 'corp', category: 'aventuras', href: '/corp', label: 'Protocolo Omega', desc: 'Aventura de texto cyberpunk. Explora 49 sectores de la Torre Nexus, neutraliza sus defensas y derrota al Director antes de que active el Protocolo Omega. Elige entre Mercenario, Netrunner o Espía Corporativo.' },
  { id: 'space-invaders', category: 'arcade', href: '/space-invaders', label: 'Space Invaders', desc: 'Defiende la Tierra de 40 alienígenas en 4 filas. Mueve tu nave con las flechas o A D y dispara con Espacio. La marcha de los aliens suena en estéreo: izquierda o derecha según su posición. Tecla E para ubicarlos en cualquier momento. Modo práctica sin disparos enemigos, y 3 niveles reales con 3 vidas.' },
  { id: 'tetris', category: 'arcade', href: '/tetris', label: 'Tetris', desc: 'Las piezas caen desde arriba: muévelas con las flechas, rota con ↑ o X, caída instantánea con Espacio. Completa líneas para eliminarlas. Sonido distintivo al rotar, colocar y limpiar líneas. Pausa con P.' },
  { id: 'frogger', category: 'arcade', href: '/frogger', label: 'Frogger', desc: 'Lleva a la rana desde la parte inferior hasta las cinco casas en la cima. Cruza la carretera esquivando coches y el río saltando sobre troncos. Los vehículos suenan en estéreo. Tecla E para escuchar los peligros cercanos. 3 vidas, 45 segundos por intento.' },
  { id: 'asteroids', category: 'arcade', href: '/asteroides', label: 'Asteroides', desc: 'Destruye todos los asteroides antes de que te alcancen. Gira con A D, propulsa con W y dispara con Espacio. Cada asteroide emite un zumbido espacializado: el estéreo indica izquierda o derecha y el tono indica arriba o abajo. Los grandes suenan muy graves, los pequeños agudos. Tecla E para escanear posiciones.' },
  { id: 'buscaminas', category: 'puzles', href: '/buscaminas', label: 'Buscaminas', desc: 'Descubre todas las celdas sin minas. Navega con las flechas o WASD, revela con Enter y marca minas con F. Cada celda emite un tono al revelarla: agudo y suave si hay pocas minas alrededor, grave y áspero si hay muchas. Tecla E para escuchar la celda actual y sus ocho vecinas. Tres dificultades: 9×9, 12×12 y 16×16.' },
  { id: 'sokoban', category: 'puzles', href: '/sokoban', label: 'Sokoban', desc: 'Empuja las cajas hasta las metas. Usa las flechas o WASD para moverte y empujar. Z deshace el último movimiento, R reinicia el nivel, E describe el entorno. 10 niveles de dificultad creciente.' },
  { id: 'tragaperras', category: 'cartas', href: '/tragaperras', label: 'Tragaperras', desc: 'Máquina tragaperras con 3 rodillos y 5 símbolos. Gira con Espacio, retén rodillos con 1-2-3. Cada símbolo tiene un tono propio. Premio máximo: tres sietes, 250 créditos. Q para salir y guardar puntuación.' },
  { id: 'quince', category: 'puzles', href: '/quince', label: 'Puzle Quince', desc: 'Puzle deslizante de 15 fichas en una cuadrícula 4×4. Desliza fichas hacia el hueco con las flechas hasta ordenarlas del 1 al 15. Cada ficha emite un tono al moverse, paneado a su columna de destino. E describe el hueco y las fichas adyacentes. Tres dificultades.' },
  { id: 'solitario', category: 'cartas', href: '/solitario', label: 'Solitario', desc: 'Klondike clásico. Mueve las 52 cartas a las cuatro fundaciones de As a Rey siguiendo el palo. Alterna colores en el tableau. Flechas para navegar entre pilas, Enter para seleccionar y colocar, A para enviar automáticamente a la fundación.' },
  { id: 'templo', category: 'aventuras', href: '/templo', label: 'El Templo Perdido', desc: 'Aventura de texto arqueológica. Explora 49 zonas de la jungla y el templo maya perdido, descubre sus secretos y derrota al Dios Serpiente Kukulkán. Elige entre Explorador, Chamán o Arqueóloga.' },
  { id: 'inca', category: 'aventuras', href: '/inca', label: 'El Imperio del Sol', desc: 'Aventura de texto en el Imperio Inca. Explora 49 zonas de los Andes y la ciudadela perdida, descubre sus secretos y derrota a Supay, el Dios de la Muerte. Elige entre Guerrero Inca, Sacerdotisa del Sol o Ladrón de Oro.' },
  { id: 'grecia', category: 'aventuras', href: '/grecia', label: 'Las Puertas del Olimpo', desc: 'Aventura de texto en la Grecia antigua. Explora 49 zonas del laberinto del Olimpo, derrota criaturas mitológicas y enfrenta a Cronos, el Titán del Tiempo. Elige entre Héroe, Sacerdotisa de Atenea o Ladrón del Olimpo.' },
  { id: 'bagdad', category: 'aventuras', href: '/bagdad', label: 'Las Mil y Una Noches', desc: 'Aventura de texto en la Bagdad de los cuentos. Explora 49 zonas del palacio maldito, derrota djinns y guardianes, y enfrenta al Califa de las Sombras. Elige entre Guerrero del Desierto, Hechicera o Ladrón de Bagdad.' },
  { id: 'china', category: 'aventuras', href: '/china', label: 'El Dragón del Cielo', desc: 'Aventura de texto en la China Imperial. Explora 49 zonas del Palacio Prohibido corrompido por la oscuridad, descubre sus secretos y derrota al Dragón del Cielo Oscuro. Elige entre Guerrero Imperial, Hechicera del Dragón o Espía de la Seda.' },
  { id: 'rusia', category: 'aventuras', href: '/rusia', label: 'El Último Bogatyr', desc: 'Aventura de texto en la Rusia Imperial y el folclore eslavo. Explora 49 zonas del palacio del Zar corrompido por Koschei el Inmortal, descubre sus secretos y derrota al hechicero de la muerte. Elige entre Bogatyr, Hechicera del Bosque o Ladrón del Zar.' },
  { id: 'oeste', category: 'aventuras', href: '/oeste', label: 'El Forajido Inmortal', desc: 'Aventura de texto en el Lejano Oeste. Explora 49 zonas del pueblo y el fortín maldito, derrota forajidos y criaturas del desierto, y enfrenta a Deadwood Jack, el Forajido Inmortal. Elige entre Pistolero, Curandera Apache o Buscador de Oro.' },
]

// Categorías de la portada, en el orden en que se muestran. Cada una es un
// encabezado h2, para saltar de grupo en grupo con el lector de pantalla.
export const CATEGORIES = [
  { id: 'arcade', label: 'Arcade y clásicos' },
  { id: 'audio', label: 'Juegos de audio' },
  { id: 'palabras', label: 'Palabras y números' },
  { id: 'puzles', label: 'Puzles y lógica' },
  { id: 'cartas', label: 'Cartas, dados y azar' },
  { id: 'mesa', label: 'Juegos de mesa' },
  { id: 'aventuras', label: 'Aventuras de texto' },
]

export const SITE_URL = 'https://juegos.dvillalon.com'
export const SITE_NAME = 'Juegos Accesibles'

// Imagen para compartir en redes (public/og-image.png). Como `openGraph` y
// `twitter` no se heredan campo a campo entre segmentos, cada metadata que
// los defina tiene que volver a incluirla.
export const OG_IMAGE = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  alt: 'Juegos Accesibles — más de 50 juegos gratis para personas ciegas',
}

// Open Graph y Twitter de una página, con la imagen común del sitio.
export function socialMetadata(title: string, description: string, path: string): Pick<Metadata, 'openGraph' | 'twitter'> {
  return {
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: 'es_ES',
      type: 'website',
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE],
    },
  }
}

// Los buscadores cortan la descripción hacia los 155-160 caracteres.
const MAX_DESCRIPTION = 160

// Recorta `text` a `max` caracteres: se queda con las frases enteras que
// quepan y, si ni la primera cabe, corta por la última palabra y añade "…".
function shorten(text: string, max: number): string {
  if (text.length <= max) return text
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? []
  let out = ''
  for (const sentence of sentences) {
    if ((out + sentence).trimEnd().length > max) break
    out += sentence
  }
  if (out) return out.trim()
  const cut = text.slice(0, max - 1)
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`
}

// Metadatos SEO de la página de un juego (title, description, canonical y
// Open Graph propios). Las páginas de juego son componentes cliente y no pueden
// exportar metadata, así que cada carpeta tiene un layout.tsx mínimo que llama a esto.
export function gameMetadata(slug: string): Metadata {
  const game = GAMES.find((g) => g.href === `/${slug}`)
  if (!game) throw new Error(`Juego desconocido en gameMetadata: ${slug}`)
  const title = `${game.label} accesible para ciegos`
  const intro = `${game.label}, juego gratis y accesible para personas ciegas, con teclado y lector de pantalla.`
  const description = `${intro} ${shorten(game.desc, MAX_DESCRIPTION - intro.length - 1)}`
  return {
    title,
    description,
    alternates: { canonical: game.href },
    ...socialMetadata(`${title} — ${SITE_NAME}`, description, game.href),
  }
}

// Slugs de todas las rutas de juego, para el sitemap.
export const GAME_SLUGS = GAMES.map((g) => g.href.slice(1))
