import type { Metadata } from 'next'

// Catálogo único de juegos: lo usan la portada (app/page.tsx), el sitemap
// (app/sitemap.ts) y el metadata de cada juego (app/<slug>/layout.tsx).
// Breakout y Mazmorra Oscura son HTML estáticos de public/games servidos en
// /breakout y /mazmorra-oscura mediante los rewrites de next.config.ts.
export const GAMES = [
  { id: 'hangman', category: 'palabras', href: '/hangman', label: 'Ahorcado', meta: 'Ahorcado accesible para ciegos: adivina la palabra secreta letra a letra con el teclado. Gratis, en español y compatible con NVDA, JAWS y VoiceOver.', desc: 'Adivina la palabra secreta letra a letra usando el teclado.' },
  { id: 'memory-sonidos', category: 'audio', href: '/memory-sonidos', label: 'Memory de Sonidos', meta: 'Memory de sonidos para ciegos: escucha una secuencia de sonidos y repítela en el mismo orden. Juego de memoria auditiva gratis, solo con teclado.', desc: 'Escucha la secuencia de sonidos y repítela en el mismo orden.' },
  { id: 'aventura-texto', category: 'aventuras', href: '/aventura-texto', label: 'Aventura de Texto', meta: 'Aventura de texto clásica en español: explora con órdenes como «ir norte» o «tomar objeto». Gratis y accesible con teclado y lector de pantalla.', desc: 'Explora un mundo con comandos de texto como ir norte, tomar objeto.' },
  { id: 'casa-encantada', category: 'aventuras', href: '/casa-encantada', label: 'Casa Encantada', meta: 'Aventura de texto de terror: explora la Mansión Voss, cuida tu vida y tu cordura y derrota al Espectro del Amo. Gratis y accesible para ciegos.', desc: 'Aventura de texto de terror. Explora la Mansión Voss, cuida tu vida y tu cordura, y derrota al Espectro del Amo para escapar.' },
  { id: 'aventura-espacio', category: 'aventuras', href: '/aventura-espacio', label: 'Aventura Espacial', meta: 'Aventura de texto espacial: explora la estación UES Kronos, descubre qué le pasó a la tripulación y destruye al Vórtex Primario. Accesible y gratis.', desc: 'Explora la estación espacial UES Kronos con comandos de texto. Descubre qué le ocurrió a la tripulación y destruye al Vórtex Primario.' },
  { id: 'breakout', category: 'arcade', href: '/breakout', label: 'Breakout', meta: 'Breakout accesible: rompe todos los bloques con la paleta, que mueves con las flechas, y lanza la bola con Espacio. Gratis en el navegador.', desc: 'Rompe todos los bloques con la paleta. Usa las flechas para moverte y Espacio para lanzar.' },
  { id: 'rpg', category: 'arcade', href: '/mazmorra-oscura', label: 'Mazmorra Oscura', meta: 'Mazmorra Oscura, RPG medieval accesible: explora mazmorras con WASD, ataca con Espacio e interactúa con E. Gratis, en español y en el navegador.', desc: 'RPG medieval accesible. Explora mazmorras con WASD, ataca con Espacio e interactúa con E.' },
  { id: 'mastermind', category: 'palabras', href: '/mastermind', label: 'Mastermind de Números', meta: 'Mastermind de números para ciegos: adivina el número secreto de 4 cifras con pistas de toros y vacas. Gratis, solo con teclado y lector de pantalla.', desc: 'Adivina el número secreto de 4 dígitos. Recibirás pistas: toros (posición correcta) y vacas (dígito correcto, posición incorrecta).' },
  { id: 'wordle', category: 'palabras', href: '/wordle', label: 'Wordle', meta: 'Wordle accesible en español: adivina la palabra de 5 letras en 6 intentos con pistas que lee tu lector de pantalla. Gratis y solo con teclado.', desc: 'Adivina la palabra de 5 letras en 6 intentos. Verde = posición correcta, amarillo = letra presente, gris = letra ausente.' },
  { id: 'mates-rapidas', category: 'palabras', href: '/mates-rapidas', label: 'Matemáticas Rápidas', meta: 'Matemáticas rápidas: resuelve operaciones de cálculo mental antes de que se acabe el tiempo, en tres niveles. Gratis y accesible para ciegos.', desc: 'Responde operaciones aritméticas antes de que se agote el tiempo. Elige entre tres niveles de dificultad.' },
  { id: 'laberinto-audio', category: 'audio', href: '/laberinto-audio', label: 'Laberinto de Audio', meta: 'Laberinto de audio: encuentra la salida guiándote solo por el sonido, con una brújula sonora de dirección y distancia. Juego gratis para ciegos.', desc: 'Navega un laberinto guiándote solo por el sonido. La brújula de audio indica dirección y distancia a la salida. Usa las flechas o WASD para moverte.' },
  { id: 'anagramas', category: 'palabras', href: '/anagramas', label: 'Anagramas', meta: 'Anagramas en español: ordena las letras y escribe la palabra antes de que se agote el tiempo, con pistas si las necesitas. Accesible para ciegos.', desc: 'Se muestra una palabra con las letras desordenadas. Escribe la palabra original antes de que se agote el tiempo. Pide pistas si necesitas ayuda.' },
  { id: 'blackjack', category: 'cartas', href: '/blackjack', label: 'Blackjack', meta: 'Blackjack accesible para ciegos: juega al 21 contra la banca con las teclas P, S y D y el lector de pantalla. Gratis, sin dinero real ni registro.', desc: 'Juego de cartas contra el dealer. Llega a 21 o acércate más que él sin pasarte. Teclas P, S y D para jugar.' },
  { id: 'gin-rummy', category: 'cartas', href: '/gin-rummy', label: 'Gin Rummy', meta: 'Gin Rummy accesible: forma tríos y escaleras con tus 10 cartas y cierra con 10 puntos sueltos o menos. Juego de cartas gratis para personas ciegas.', desc: 'Juego de cartas clásico. Forma combinaciones (tríos o escaleras) con tus 10 cartas y llama cuando tengas 10 puntos sueltos o menos. Roba con M o D, descarta con 1-0 y R.' },
  { id: 'poker', category: 'cartas', href: '/poker', label: "Póker Texas Hold'em", meta: "Póker Texas Hold'em contra la IA, accesible para ciegos: iguala, pasa o sube con el teclado, con 1000 fichas de inicio. Gratis y sin dinero real.", desc: "Texas Hold'em contra la IA. Recibes 2 cartas y compites con 5 cartas comunitarias. Iguala, pasa o sube en cada ronda. F=retirarte, C=igualar/pasar, R=subir. Empieza con 1000 fichas." },
  { id: 'truco', category: 'cartas', href: '/truco', label: 'Truco', meta: 'Truco argentino accesible: 1 contra 1 con baraja española de 40 cartas; canta Envido con E y Truco con T. Gratis para personas ciegas.', desc: 'Truco argentino 1 contra 1. Mazo español de 40 cartas, 3 bazas por mano. Canta Envido (E) antes de la primera baza y Truco (T) en cualquier momento. Primero en llegar a 15 puntos gana.' },
  { id: 'parchis', category: 'mesa', href: '/parchis', label: 'Parchís', meta: 'Parchís accesible para ciegos: 1 contra 1 con la IA, dado con R y fichas con 1-4. Saca un 5 para salir de casa. Gratis y solo con teclado.', desc: 'Parchís 1 contra 1. 4 fichas cada jugador (rojas tú, azules la IA). Lanza el dado con R, elige ficha con 1-4. Saca un 5 para salir de casa. Seis y capturas dan turno extra. Gana quien meta las 4 fichas primero.' },
  { id: 'pong-audio', category: 'audio', href: '/pong-audio', label: 'Pong de Audio', meta: 'Pong de audio para ciegos: la posición de la pelota suena en estéreo y con su tono. Mueve tu paleta con las flechas o W y S. Gratis en el navegador.', desc: 'Pong totalmente accesible por sonido. La posición de la pelota se indica con sonido estéreo y tono. Usa las flechas o W S para mover tu paleta.' },
  { id: 'batalla-naval', category: 'mesa', href: '/batalla-naval', label: 'Batalla Naval', meta: 'Batalla naval accesible: hunde la flota enemiga en un tablero de 10×10 con el teclado, con explosiones y chapoteos que te dicen el resultado.', desc: 'Hunde la flota enemiga disparando en un tablero de 10×10. Coloca tus barcos con el teclado y recibe feedback sonoro: explosión para impactos, chapoteo para fallos.' },
  { id: 'penaltis', category: 'arcade', href: '/penaltis', label: 'Penaltis', meta: 'Penaltis accesibles: tanda de 5 tiros; elige izquierda, centro o derecha para chutar o parar ante un portero que aprende de ti. Gratis para ciegos.', desc: 'Tanda de 5 penaltis. Elige izquierda, centro o derecha para disparar o defender. El portero rival se adapta a tu historial de tiros.' },
  { id: 'tres-en-raya', category: 'mesa', href: '/tres-en-raya', label: 'Tres en Raya', meta: 'Tres en raya accesible para ciegos: mueve el cursor con las flechas y marca con Enter contra una IA que juega perfecto. Gratis y solo con teclado.', desc: 'Juega al tres en raya contra la IA. Mueve el cursor con las flechas y coloca tu marca con Enter. La IA juega de forma óptima.' },
  { id: 'gorillas', category: 'arcade', href: '/gorillas', label: 'Gorilas', meta: 'Gorilas, el clásico Gorillas.bas accesible: elige ángulo y velocidad para lanzar el plátano al gorila rival, con viento. Al mejor de 3 rondas.', desc: 'El clásico Gorillas.bas. Introduce el ángulo y la velocidad para lanzar un plátano explosivo al gorila enemigo. El viento complica la puntería. Partida al mejor de 3 rondas.' },
  { id: 'misterio', category: 'aventuras', href: '/misterio', label: 'Detective: El Caso Blackwood', meta: 'Detective: El Caso Blackwood. Interroga a cinco sospechosos, examina la escena del crimen y acusa al culpable. Misterio de texto accesible y gratis.', desc: 'Juego de misterio detectivesco. Lord Blackwood ha sido hallado muerto envenenado. Interroga a los cinco sospechosos, examina la escena del crimen y acusa al culpable.' },
  { id: 'secuencias', category: 'audio', href: '/secuencias', label: 'Secuencias', meta: 'Secuencias: cruza un puente de cristal escuchando los tonos, agudo es seguro y grave peligroso. Memoria auditiva en 3 dificultades, accesible.', desc: 'Puente de plataformas de cristal. Escucha los tonos antes de saltar: agudo = seguro, grave = peligroso. Memoriza la secuencia y cruza el puente. 3 dificultades: 5, 8 o 12 saltos.' },
  { id: 'conecta4', category: 'mesa', href: '/conecta-cuatro', label: 'Conecta 4', meta: 'Conecta 4 accesible para ciegos: elige columna con las flechas y suelta la ficha con Enter para hacer 4 en línea antes que la IA. Gratis y sin ratón.', desc: 'Coloca fichas amarillas para conectar 4 en línea (horizontal, vertical o diagonal) antes que la IA. Usa las flechas para mover entre columnas y Enter para soltar la ficha.' },
  { id: 'generala', category: 'cartas', href: '/generala', label: 'Generala', meta: 'Generala accesible: 5 dados, 3 tiradas por turno y 13 categorías como Escalera, Full o Póker. Tira con R y guarda con 1-5. Gratis para ciegos.', desc: '13 turnos, 5 dados, hasta 3 tiradas por turno. Rellena categorías como Escalera, Full, Póker o Generala para acumular la mayor puntuación posible. R para tirar, 1-5 para guardar dados, ↑↓ y Enter para anotar.' },
  { id: '2048', category: 'puzles', href: '/2048', label: '2048', meta: '2048 accesible para ciegos: desliza las fichas con las flechas y fusiona números iguales hasta llegar a 2048. Gratis, con teclado y lector de pantalla.', desc: 'Desliza las fichas numéricas con las flechas para fusionarlas. Cuando dos fichas iguales chocan se combinan en una sola. Llega a la ficha 2048.' },
  { id: 'bingo', category: 'cartas', href: '/bingo', label: 'Bingo', meta: 'Bingo accesible: cartón de 5×5 con números del 1 al 75 que se marcan solos. Pide bola con Espacio y canta línea o bingo. Gratis para ciegos.', desc: 'Cartón de 5×5 con números del 1 al 75. Las bolas se cantan con su letra (B, I, N, G, O) y los números de tu cartón se marcan solos. Pulsa Espacio para pedir cada bola. Gana con una línea o el Bingo completo.' },
  { id: 'aventura-magica', category: 'aventuras', href: '/aventura-magica', label: 'El Cristal Eterno', meta: 'El Cristal Eterno: aventura de texto de fantasía medieval. Reúne los 3 fragmentos y derrota al Dragón de las Sombras como Paladín, Hechicera o Ladrón.', desc: 'Aventura medieval fantástica. El Dragón de las Sombras ha destruido el Cristal Eterno. Recorre el reino de Eloria, reúne los 3 Fragmentos y derrota al Dragón. Elige entre Paladín, Hechicera o Ladrón.' },
  { id: 'pirata', category: 'aventuras', href: '/pirata', label: 'El Tesoro del Corsario Negro', meta: 'Aventura pirata de texto: explora 49 zonas de la Isla Maldita y derrota al Corsario Negro como Capitán, Bruja del Mar o Navegante. Gratis y accesible.', desc: 'Aventura pirata de texto. Explora 49 zonas de la Isla Maldita, recoge tesoros y derrota al Corsario Negro para quedarte con el Gran Tesoro. Elige entre Capitán, Bruja del Mar o Navegante.' },
  { id: 'egipto', category: 'aventuras', href: '/egipto', label: 'La Maldición del Faraón', meta: 'La Maldición del Faraón: aventura de texto en el antiguo Egipto. Recorre 49 cámaras de la tumba de Amenhotep III y esquiva sus trampas. Accesible.', desc: 'Aventura de texto en el antiguo Egipto. Explora 49 cámaras de la tumba de Amenhotep III, esquiva trampas y derrota al espíritu inmortal del faraón. Elige entre Arqueóloga, Sacerdote de Ra o Ladrón de tumbas.' },
  { id: 'samurai', category: 'aventuras', href: '/samurai', label: 'El Honor del Samurái', meta: 'El Honor del Samurái: aventura de texto en el Japón feudal. Explora el castillo Kurogane y derrota al Shogun como Samurái, Ninja o Monje guerrero.', desc: 'Aventura de texto en el Japón feudal. Explora 49 estancias del castillo Kurogane, derrota al Shogun usurpador y restaura el honor del feudo. Elige entre Samurái, Ninja o Monje guerrero.' },
  { id: 'vikingos', category: 'aventuras', href: '/vikingos', label: 'La Furia del Jarl', meta: 'La Furia del Jarl: aventura de texto vikinga. Explora el fortín Haraldur y libera al clan de la maldición de Loki. Gratis y accesible para ciegos.', desc: 'Aventura de texto en el norte vikingo. Explora 49 salas del fortín Haraldur, derrota al Jarl Oscuro y libera al clan de la maldición de Loki. Elige entre Guerrero Vikingo, Escaldo o Berserker.' },
  { id: 'abismo', category: 'aventuras', href: '/abismo', label: 'Las Ruinas del Abismo', meta: 'Las Ruinas del Abismo: aventura de texto submarina. Explora 49 zonas de unas ruinas hundidas y derrota al Leviatán. Gratis y accesible para ciegos.', desc: 'Aventura de texto en las profundidades oceánicas. Explora 49 zonas de unas ruinas sumergidas, descubre sus secretos y derrota al Leviatán del Abismo. Elige entre Comandante, Bióloga Marina o Explorador de Profundidades.' },
  { id: 'zona', category: 'aventuras', href: '/zona', label: 'La Zona Muerta', meta: 'La Zona Muerta: aventura de texto postapocalíptica. Sobrevive a raiders y mutantes en 49 zonas del páramo y derrota al Señor de la Zona. Accesible.', desc: 'Aventura de texto postapocalíptica. Explora 49 zonas del páramo devastado, sobrevive a raiders y mutantes, y derrota al Señor de la Zona. Elige entre Soldado, Médica de Campo o Saqueador.' },
  { id: 'castillo', category: 'aventuras', href: '/castillo', label: 'La Maldición del Conde', meta: 'La Maldición del Conde: aventura de texto de terror gótico. Explora el castillo del Conde Vordrak y exorciza su espíritu. Gratis y accesible.', desc: 'Aventura de texto de terror gótico. Explora 49 estancias del castillo maldito del Conde Vordrak, descubre sus secretos y exorciza a su espíritu inmortal. Elige entre Cazador de Vampiros, Médium o Alquimista.' },
  { id: 'corp', category: 'aventuras', href: '/corp', label: 'Protocolo Omega', meta: 'Protocolo Omega: aventura de texto cyberpunk. Infíltrate en 49 sectores de la Torre Nexus y detén al Director. Gratis y accesible para ciegos.', desc: 'Aventura de texto cyberpunk. Explora 49 sectores de la Torre Nexus, neutraliza sus defensas y derrota al Director antes de que active el Protocolo Omega. Elige entre Mercenario, Netrunner o Espía Corporativo.' },
  { id: 'space-invaders', category: 'arcade', href: '/space-invaders', label: 'Space Invaders', meta: 'Space Invaders accesible para ciegos: la marcha de los aliens suena en estéreo y la tecla E los ubica. Modo práctica y 3 niveles. Gratis en el navegador.', desc: 'Defiende la Tierra de 40 alienígenas en 4 filas. Mueve tu nave con las flechas o A D y dispara con Espacio. La marcha de los aliens suena en estéreo: izquierda o derecha según su posición. Tecla E para ubicarlos en cualquier momento. Modo práctica sin disparos enemigos, y 3 niveles reales con 3 vidas.' },
  { id: 'tetris', category: 'arcade', href: '/tetris', label: 'Tetris', meta: 'Tetris accesible para ciegos: sonidos distintos al rotar, colocar y limpiar líneas, y mueves las piezas con las flechas. Gratis y solo con teclado.', desc: 'Las piezas caen desde arriba: muévelas con las flechas, rota con ↑ o X, caída instantánea con Espacio. Completa líneas para eliminarlas. Sonido distintivo al rotar, colocar y limpiar líneas. Pausa con P.' },
  { id: 'frogger', category: 'arcade', href: '/frogger', label: 'Frogger', meta: 'Frogger accesible: cruza la carretera y el río con la rana guiándote por coches que suenan en estéreo; la tecla E te avisa de los peligros. Gratis.', desc: 'Lleva a la rana desde la parte inferior hasta las cinco casas en la cima. Cruza la carretera esquivando coches y el río saltando sobre troncos. Los vehículos suenan en estéreo. Tecla E para escuchar los peligros cercanos. 3 vidas, 45 segundos por intento.' },
  { id: 'asteroids', category: 'arcade', href: '/asteroides', label: 'Asteroides', meta: 'Asteroides accesible para ciegos: cada roca zumba en estéreo y su tono indica si está arriba o abajo; la tecla E las escanea. Gratis en el navegador.', desc: 'Destruye todos los asteroides antes de que te alcancen. Gira con A D, propulsa con W y dispara con Espacio. Cada asteroide emite un zumbido espacializado: el estéreo indica izquierda o derecha y el tono indica arriba o abajo. Los grandes suenan muy graves, los pequeños agudos. Tecla E para escanear posiciones.' },
  { id: 'buscaminas', category: 'puzles', href: '/buscaminas', label: 'Buscaminas', meta: 'Buscaminas accesible para ciegos: cada celda suena más grave cuantas más minas tiene cerca y la tecla E describe las vecinas. Tres tamaños, gratis.', desc: 'Descubre todas las celdas sin minas. Navega con las flechas o WASD, revela con Enter y marca minas con F. Cada celda emite un tono al revelarla: agudo y suave si hay pocas minas alrededor, grave y áspero si hay muchas. Tecla E para escuchar la celda actual y sus ocho vecinas. Tres dificultades: 9×9, 12×12 y 16×16.' },
  { id: 'sokoban', category: 'puzles', href: '/sokoban', label: 'Sokoban', meta: 'Sokoban accesible: empuja las cajas hasta las metas en 10 niveles. Z deshace, R reinicia y E describe el entorno. Gratis para personas ciegas.', desc: 'Empuja las cajas hasta las metas. Usa las flechas o WASD para moverte y empujar. Z deshace el último movimiento, R reinicia el nivel, E describe el entorno. 10 niveles de dificultad creciente.' },
  { id: 'tragaperras', category: 'cartas', href: '/tragaperras', label: 'Tragaperras', meta: 'Tragaperras accesible: 3 rodillos y un tono propio para cada símbolo. Gira con Espacio y retén con 1-2-3. Gratis, sin dinero real, para ciegos.', desc: 'Máquina tragaperras con 3 rodillos y 5 símbolos. Gira con Espacio, retén rodillos con 1-2-3. Cada símbolo tiene un tono propio. Premio máximo: tres sietes, 250 créditos. Q para salir y guardar puntuación.' },
  { id: 'quince', category: 'puzles', href: '/quince', label: 'Puzle Quince', meta: 'Puzle del quince accesible: ordena 15 fichas deslizantes del 1 al 15 con las flechas, guiado por tonos en estéreo. Tres dificultades, gratis.', desc: 'Puzle deslizante de 15 fichas en una cuadrícula 4×4. Desliza fichas hacia el hueco con las flechas hasta ordenarlas del 1 al 15. Cada ficha emite un tono al moverse, paneado a su columna de destino. E describe el hueco y las fichas adyacentes. Tres dificultades.' },
  { id: 'solitario', category: 'cartas', href: '/solitario', label: 'Solitario', meta: 'Solitario Klondike accesible para ciegos: lleva las 52 cartas a las fundaciones con las flechas y Enter; la A envía la carta sola. Gratis.', desc: 'Klondike clásico. Mueve las 52 cartas a las cuatro fundaciones de As a Rey siguiendo el palo. Alterna colores en el tableau. Flechas para navegar entre pilas, Enter para seleccionar y colocar, A para enviar automáticamente a la fundación.' },
  { id: 'templo', category: 'aventuras', href: '/templo', label: 'El Templo Perdido', meta: 'El Templo Perdido: aventura de texto en un templo maya. Explora 49 zonas de jungla y derrota al Dios Serpiente Kukulkán. Gratis y accesible.', desc: 'Aventura de texto arqueológica. Explora 49 zonas de la jungla y el templo maya perdido, descubre sus secretos y derrota al Dios Serpiente Kukulkán. Elige entre Explorador, Chamán o Arqueóloga.' },
  { id: 'inca', category: 'aventuras', href: '/inca', label: 'El Imperio del Sol', meta: 'El Imperio del Sol: aventura de texto en el Imperio Inca. Explora los Andes y la ciudadela perdida y derrota a Supay. Gratis y accesible para ciegos.', desc: 'Aventura de texto en el Imperio Inca. Explora 49 zonas de los Andes y la ciudadela perdida, descubre sus secretos y derrota a Supay, el Dios de la Muerte. Elige entre Guerrero Inca, Sacerdotisa del Sol o Ladrón de Oro.' },
  { id: 'grecia', category: 'aventuras', href: '/grecia', label: 'Las Puertas del Olimpo', meta: 'Las Puertas del Olimpo: aventura de texto mitológica. Recorre el laberinto del Olimpo y enfréntate a Cronos, el Titán del Tiempo. Accesible y gratis.', desc: 'Aventura de texto en la Grecia antigua. Explora 49 zonas del laberinto del Olimpo, derrota criaturas mitológicas y enfrenta a Cronos, el Titán del Tiempo. Elige entre Héroe, Sacerdotisa de Atenea o Ladrón del Olimpo.' },
  { id: 'bagdad', category: 'aventuras', href: '/bagdad', label: 'Las Mil y Una Noches', meta: 'Las Mil y Una Noches: aventura de texto en Bagdad. Derrota djinns en el palacio maldito y vence al Califa de las Sombras. Gratis y accesible.', desc: 'Aventura de texto en la Bagdad de los cuentos. Explora 49 zonas del palacio maldito, derrota djinns y guardianes, y enfrenta al Califa de las Sombras. Elige entre Guerrero del Desierto, Hechicera o Ladrón de Bagdad.' },
  { id: 'china', category: 'aventuras', href: '/china', label: 'El Dragón del Cielo', meta: 'El Dragón del Cielo: aventura de texto en la China imperial. Libera el Palacio Prohibido y derrota al Dragón del Cielo Oscuro. Gratis y accesible.', desc: 'Aventura de texto en la China Imperial. Explora 49 zonas del Palacio Prohibido corrompido por la oscuridad, descubre sus secretos y derrota al Dragón del Cielo Oscuro. Elige entre Guerrero Imperial, Hechicera del Dragón o Espía de la Seda.' },
  { id: 'rusia', category: 'aventuras', href: '/rusia', label: 'El Último Bogatyr', meta: 'El Último Bogatyr: aventura de texto del folclore eslavo. Recorre el palacio del Zar y derrota a Koschei el Inmortal. Gratis y accesible para ciegos.', desc: 'Aventura de texto en la Rusia Imperial y el folclore eslavo. Explora 49 zonas del palacio del Zar corrompido por Koschei el Inmortal, descubre sus secretos y derrota al hechicero de la muerte. Elige entre Bogatyr, Hechicera del Bosque o Ladrón del Zar.' },
  { id: 'oeste', category: 'aventuras', href: '/oeste', label: 'El Forajido Inmortal', meta: 'El Forajido Inmortal: aventura de texto del Lejano Oeste. Derrota forajidos en 49 zonas y enfréntate a Deadwood Jack. Gratis y accesible para ciegos.', desc: 'Aventura de texto en el Lejano Oeste. Explora 49 zonas del pueblo y el fortín maldito, derrota forajidos y criaturas del desierto, y enfrenta a Deadwood Jack, el Forajido Inmortal. Elige entre Pistolero, Curandera Apache o Buscador de Oro.' },
]

// Categorías, en el orden en que se muestran en la portada. Cada una es un
// encabezado h2 de la portada, para saltar de grupo en grupo con el lector de
// pantalla, y tiene su propia página en /<slug> (app/<slug>/page.tsx) con
// título, descripción y una introducción propios.
export const CATEGORIES = [
  {
    id: 'arcade',
    slug: 'juegos-arcade',
    label: 'Arcade y clásicos',
    title: 'Juegos arcade accesibles para ciegos',
    meta: 'Tetris, Space Invaders, Frogger, Asteroides y otros clásicos arcade adaptados para personas ciegas con sonido estéreo. Gratis y solo con teclado.',
    intro: [
      'Los clásicos de las recreativas, rehechos para jugarse sin mirar la pantalla. En lugar de ver dónde está cada enemigo o cada pieza, lo oyes: los sonidos se colocan a la izquierda o a la derecha según su posición y cambian de tono según la altura o la distancia.',
      'Varios juegos tienen una tecla de escaneo, la E, que describe en voz alta lo que tienes cerca en cualquier momento, y algunos incluyen un modo práctica para aprender los controles sin perder vidas. Todo se maneja con el teclado y el lector de pantalla anuncia la puntuación, las vidas y el final de la partida.',
    ],
  },
  {
    id: 'audio',
    slug: 'juegos-de-audio',
    label: 'Juegos de audio',
    title: 'Juegos de audio para personas ciegas',
    meta: 'Juegos de audio gratis para ciegos: un laberinto que se recorre por el sonido, Pong de audio, memoria de sonidos y un puente de tonos. Solo con teclado.',
    intro: [
      'Juegos pensados desde el principio para el oído. No adaptan un juego visual: el sonido es la mecánica. Recorres un laberinto con una brújula sonora que te indica la dirección y la distancia de la salida, devuelves la pelota en un Pong donde su posición suena en estéreo o memorizas secuencias de tonos.',
      'Se disfrutan más con auriculares, porque la diferencia entre el oído izquierdo y el derecho es parte del juego.',
    ],
  },
  {
    id: 'palabras',
    slug: 'juegos-de-palabras',
    label: 'Palabras y números',
    title: 'Juegos de palabras y números accesibles',
    meta: 'Wordle, Ahorcado, Anagramas, Mastermind y cálculo mental en español, accesibles para personas ciegas con lector de pantalla. Gratis y solo con teclado.',
    intro: [
      'Juegos de vocabulario, lógica numérica y cálculo mental en español. Escribes las respuestas con el teclado y el lector de pantalla te lee cada pista: qué letras están en su sitio en Wordle, cuántas cifras has acertado en Mastermind o qué letras quedan por descubrir en el Ahorcado.',
      'Son partidas cortas, buenas para unos minutos de pausa, y ninguna depende del color: toda la información llega también como texto.',
    ],
  },
  {
    id: 'puzles',
    slug: 'puzles-accesibles',
    label: 'Puzles y lógica',
    title: 'Puzles y juegos de lógica accesibles para ciegos',
    meta: 'Buscaminas, Sokoban, 2048 y el puzle del quince adaptados para ciegos, con tonos que describen el tablero y teclas para explorarlo. Gratis y sin ratón.',
    intro: [
      'Puzles de tablero que normalmente se resuelven con la vista, adaptados para explorarse con el teclado. Te mueves por las casillas con las flechas y el lector de pantalla, junto con tonos propios de cada juego, te dice lo que hay en cada una.',
      'En el Buscaminas, por ejemplo, cada celda suena más grave cuantas más minas tiene alrededor, y en varios juegos la tecla E describe el entorno de la casilla en la que estás.',
    ],
  },
  {
    id: 'cartas',
    slug: 'juegos-de-cartas',
    label: 'Cartas, dados y azar',
    title: 'Juegos de cartas, dados y azar para ciegos',
    meta: "Juegos de cartas para ciegos: Solitario, Blackjack, Póker Texas Hold'em, Truco, Gin Rummy, Generala y Bingo. Gratis, sin dinero real y solo con teclado.",
    intro: [
      'Juegos de cartas y de dados contra el ordenador, accesibles con lector de pantalla. Cada carta se nombra por su valor y su palo, cada acción tiene su tecla y el juego te anuncia lo que hace el rival, así que puedes seguir la partida sin ver la mesa.',
      'Hay clásicos de casino como el Blackjack o el Póker, juegos de baraja española como el Truco y juegos tranquilos para jugar solo, como el Solitario. Se juega con fichas o créditos ficticios, nunca con dinero real.',
    ],
  },
  {
    id: 'mesa',
    slug: 'juegos-de-mesa',
    label: 'Juegos de mesa',
    title: 'Juegos de mesa accesibles para ciegos',
    meta: 'Parchís, Conecta 4, Tres en Raya y Batalla Naval accesibles para personas ciegas: juega contra la IA con el teclado y el lector de pantalla. Gratis.',
    intro: [
      'Juegos de mesa de toda la vida contra una inteligencia artificial. Cada jugada se hace con el teclado, con las flechas o con teclas propias de cada juego, y el lector de pantalla te dice qué hay en el tablero y qué ha jugado la IA.',
      'Los sonidos ayudan a seguir la partida: en la Batalla Naval, por ejemplo, una explosión significa impacto y un chapoteo, agua.',
    ],
  },
  {
    id: 'aventuras',
    slug: 'aventuras-de-texto',
    label: 'Aventuras de texto',
    title: 'Aventuras de texto en español, accesibles para ciegos',
    meta: '20 aventuras de texto en español: terror, ciencia ficción, piratas, mitología, fantasía y el Lejano Oeste. Gratis, accesibles para ciegos y con teclado.',
    intro: [
      'Las aventuras de texto, también llamadas aventuras conversacionales o ficción interactiva, son accesibles por naturaleza: todo el juego es texto que lee tu lector de pantalla. Exploras escribiendo órdenes como «ir norte», «tomar llave» o «atacar», descubres el mapa sala a sala y resuelves el misterio de cada historia.',
      'Hay ambientaciones para todos los gustos: terror gótico, ciencia ficción, piratas, el antiguo Egipto, el Japón feudal, la Grecia mitológica o el Lejano Oeste. En muchas eliges al principio entre tres personajes con estilos de juego distintos.',
    ],
  },
]

type Category = (typeof CATEGORIES)[number]

export function categoryById(id: string): Category {
  const category = CATEGORIES.find((c) => c.id === id)
  if (!category) throw new Error(`Categoría desconocida: ${id}`)
  return category
}

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

// Los buscadores cortan el título hacia los 60-65 caracteres. La descripción
// de cada juego (`meta` en GAMES) está escrita a mano para que quepa entera en
// los 155-160 que muestran (entre 120 y 160 caracteres, sin cortar).
const MAX_TITLE = 65

// Metadatos SEO de la página de un juego (title, description, canonical y
// Open Graph propios). Las páginas de juego son componentes cliente y no pueden
// exportar metadata, así que cada carpeta tiene un layout.tsx mínimo que llama a esto.
export function gameMetadata(slug: string): Metadata {
  const game = gameBySlug(slug)
  const title = `${game.label} accesible para ciegos`
  // Con el sufijo del sitio (plantilla de app/layout.tsx) los nombres largos
  // pasan del ancho que muestran los buscadores: en ese caso va sin sufijo.
  const fullTitle = `${title} — ${SITE_NAME}`
  const tooLong = fullTitle.length > MAX_TITLE
  const description = game.meta
  return {
    title: tooLong ? { absolute: title } : title,
    description,
    alternates: { canonical: game.href },
    ...socialMetadata(tooLong ? title : fullTitle, description, game.href),
  }
}

// Metadatos SEO de la página de una categoría (app/<slug>/page.tsx).
export function categoryMetadata(id: string): Metadata {
  const category = categoryById(id)
  const path = `/${category.slug}`
  return {
    title: { absolute: category.title },
    description: category.meta,
    alternates: { canonical: path },
    ...socialMetadata(category.title, category.meta, path),
  }
}

// Slugs de todas las rutas de juego, para el sitemap.
export const GAME_SLUGS = GAMES.map((g) => g.href.slice(1))

type Game = (typeof GAMES)[number]

function gameBySlug(slug: string): Game {
  const game = GAMES.find((g) => g.href === `/${slug}`)
  if (!game) throw new Error(`Juego desconocido: ${slug}`)
  return game
}

// Juegos de la misma categoría para el bloque «Juegos similares»: los que
// siguen al juego en el catálogo, volviendo al principio de la categoría si
// hace falta. Así cada juego enlaza a otros distintos y todos reciben enlaces.
export function relatedGames(slug: string, count = 4): Game[] {
  const game = gameBySlug(slug)
  const same = GAMES.filter((g) => g.category === game.category)
  const start = same.indexOf(game)
  return Array.from({ length: Math.min(count, same.length - 1) }, (_, i) => same[(start + 1 + i) % same.length])
}

// Datos estructurados VideoGame de la página de un juego. No es un script
// ejecutable; se escapa "<" para que ningún texto pueda cerrar la etiqueta.
export function gameJsonLd(slug: string): string {
  const game = gameBySlug(slug)
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.label,
    description: game.meta,
    url: `${SITE_URL}${game.href}`,
    image: `${SITE_URL}${OG_IMAGE.url}`,
    genre: CATEGORIES.find((c) => c.id === game.category)?.label,
    gamePlatform: 'Web browser',
    applicationCategory: 'Game',
    operatingSystem: 'Cualquiera con navegador web',
    inLanguage: 'es',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR' },
    accessMode: ['textual', 'auditory'],
    accessibilityControl: ['fullKeyboardControl'],
    accessibilityAPI: ['ARIA'],
    author: { '@type': 'Person', name: 'Daniel Villalón', url: 'https://dvillalon.com/' },
    isPartOf: { '@id': `${SITE_URL}/#website` },
  }).replace(/</g, '\\u003c')
}
