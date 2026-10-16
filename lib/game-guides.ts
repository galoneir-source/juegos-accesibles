// Textos de la página de cada juego, bajo el juego (components/games/GameExtras.tsx):
// cómo se juega sin ver la pantalla, los controles y, si los tiene, los niveles.
// Están sacados de las instrucciones y del código de cada juego: si cambia un
// control o un sonido, hay que cambiarlo también aquí.
export type GameGuide = {
  // Cómo se adapta el juego a quien no ve la pantalla: sonidos y anuncios.
  como: string
  controles: string
  // Dificultades, niveles, vidas y cómo se puntúa.
  progreso?: string
}

// Las aventuras de 49 zonas comparten motor: mapa, combate, objetos y tres
// personajes. Cada una cambia la ambientación, los objetos y la habilidad
// especial de cada personaje.
type Aventura = {
  ambiente: string
  zonas: string
  jefe: string
  curar: string
  arma: string
  defensa: string
  llave: string
  fuerte: string
  magia: { quien: string; orden: string; efecto: string }
  explorar: { quien: string; orden: string }
}

function aventura(a: Aventura): GameGuide {
  return {
    como: `${a.ambiente} Como toda aventura de texto, se juega leyendo y escribiendo: cada vez que entras en ${a.zonas} el lector de pantalla lee su descripción, lo que hay en ella y las salidas disponibles, y tú respondes con una orden escrita. Los sucesos y las descripciones de las salas se reparten al azar en cada partida, así que nunca hay dos iguales. No hace falta dibujar nada: con «mirar» vuelves a escuchar dónde estás y con «inventario» tu vida y lo que llevas. Unos sonidos breves acompañan los aciertos, los golpes recibidos y los hallazgos.`,
    controles: `Escribe la orden y pulsa Enter: «ir norte» (o sur, este, oeste), «mirar», «inventario», «tomar» para recoger objetos y «usar ${a.curar}» para curarte. En combate, «atacar» o «huir»; de ${a.jefe} no se puede huir. Las flechas arriba y abajo recuperan las órdenes anteriores, como en una consola, y la tecla H repite las instrucciones.`,
    progreso: `Al empezar eliges personaje. ${a.fuerte} tiene más vida y daño, y con ${a.arma} hace el doble de daño a ${a.jefe}. ${a.magia.quien} escribe «${a.magia.orden}» en combate para ${a.magia.efecto} cada 3 turnos. ${a.explorar.quien} escribe «${a.explorar.orden}» para saber qué hay en las zonas de alrededor antes de entrar. ${a.defensa} reduce el daño que recibes y ${a.llave} abre los pasos cerrados. La partida se guarda sola en el navegador, así que puedes dejarla y seguir otro día.`,
  }
}

export const GAME_GUIDES: Record<string, GameGuide> = {
  // ── Arcade y clásicos ──────────────────────────────────────────────────────
  'tetris': {
    como: 'Cada acción tiene su sonido: mover la pieza, rotarla, dejarla caer, encajarla y completar una línea suenan distinto, así que sabes qué ha pasado sin mirar. La clave es la tecla E: hace un barrido sonoro del tablero de izquierda a derecha, columna a columna, con un tono agudo para las columnas libres y uno grave para las llenas, y después te dice cuántas celdas libres hay bajo la pieza y cuántas filas va a caer. Con R el lector de pantalla te lee el estado de la partida.',
    controles: 'Flechas izquierda y derecha para mover la pieza, flecha arriba o X para rotarla, flecha abajo para bajarla más rápido y Espacio para dejarla caer de golpe. E para el barrido de columnas, R para leer el estado, P para pausar y H para repetir las instrucciones.',
    progreso: 'Cada línea completa suma puntos, y más si eliminas varias a la vez. Cada 10 líneas subes de nivel y las piezas caen más deprisa.',
  },
  'space-invaders': {
    como: 'La marcha de los alienígenas suena en estéreo: si la oyes por el oído izquierdo, el grupo está a tu izquierda. Sus disparos también suenan desde la posición del alien que dispara, y el tuyo sale del lado donde está tu nave. Con la tecla E oyes primero un pitido en la posición de tu nave y luego la marcha en la de los aliens, para saber hacia dónde moverte. Con auriculares se juega mucho mejor.',
    controles: 'Flechas izquierda y derecha, o A y D, para mover la nave; Espacio para disparar (solo un disparo en el aire a la vez). E para ubicar nave y aliens, R para que el lector de pantalla te diga la posición y el estado, y H para las instrucciones.',
    progreso: 'Hay un modo Práctica en el que los aliens no disparan, para aprender a guiarte por el sonido, y tres niveles (Fácil, Medio y Difícil) en los que la marcha es más rápida y disparan más. Tienes 3 vidas y los niveles altos multiplican la puntuación.',
  },
  'frogger': {
    como: 'Los coches suenan con un rumor grave y los troncos con un toque agudo de madera; cuanto más cerca, más fuerte, y el sonido se desplaza a izquierda o derecha según por dónde vengan. La fila que tienes delante suena más alta que la de detrás para distinguirlas. Cada medio segundo un campaneo suave te avisa si la siguiente fila es segura, y cuando vas sobre un tronco oyes un golpecito rítmico que confirma que estás a salvo. La tecla E resume los peligros y si el camino al frente está libre.',
    controles: 'Flechas o WASD para saltar en las cuatro direcciones. E para escuchar los peligros, R para el estado y H para las instrucciones.',
    progreso: 'Tienes que llevar la rana a las cinco casas de la orilla de arriba. Cuentas con 3 vidas y 45 segundos por intento: un coche o caer al agua te cuestan una vida.',
  },
  'asteroides': {
    como: 'Cada asteroide emite un zumbido continuo: el estéreo indica si está a la izquierda o a la derecha de tu nave y el tono, si está arriba o abajo. El tamaño también se oye: los grandes suenan muy graves, los medianos medios y los pequeños agudos. Con la tecla E el juego hace sonar la posición de cada asteroide uno a uno y te anuncia el más cercano.',
    controles: 'Flechas izquierda y derecha, o A y D, para girar; flecha arriba o W para propulsarte hacia donde apunta la nave; Espacio para disparar. E para escanear, R para el estado y H para las instrucciones.',
    progreso: 'Al destruir un asteroide grande se parte en dos medianos, y un mediano en dos pequeños. Tienes 3 vidas y 2 segundos de invencibilidad cada vez que reapareces.',
  },
  'penaltis': {
    como: 'El lector de pantalla te dice en cada momento si te toca tirar o parar y, tras cada penalti, hacia dónde fue el balón y hacia dónde se lanzó el portero. El chut, el gol y la parada tienen su propio sonido. Es un juego de intuición: el portero rival se fija en hacia dónde sueles tirar.',
    controles: 'Flecha izquierda para tirar o lanzarte a la izquierda, flecha abajo o Espacio para el centro y flecha derecha para la derecha. H repite las instrucciones.',
    progreso: 'Una tanda de cinco penaltis: primero tiras tú y luego tira el rival. Gana quien marque más.',
  },
  'gorillas': {
    como: 'Una versión accesible del Gorillas.bas de QBasic. En lugar de mirar la parábola en pantalla, escribes el ángulo y la velocidad del lanzamiento y, si fallas, el juego te dice a cuántos metros y hacia qué lado cayó el plátano, para que corrijas el siguiente tiro. El lanzamiento, la explosión y el impacto tienen sonido propio.',
    controles: 'Escribe el ángulo en grados (de 1 a 89) y la velocidad (de 10 a 200) en sus campos y pulsa Enter para lanzar. H repite las instrucciones.',
    progreso: 'El viento cambia en cada ronda y desvía el plátano. La partida es al mejor de 3 rondas.',
  },

  // ── Juegos de audio ────────────────────────────────────────────────────────
  'memory-sonidos': {
    como: 'Un juego de memoria auditiva en el que no hay nada que ver: el juego toca una secuencia de tonos y tú la repites en el mismo orden. Cada uno de los 8 botones tiene su nota, así que con un poco de práctica reconoces cada tono por el oído.',
    controles: 'Teclas del 1 al 8 (o los botones numerados) para tocar cada tono. R relee el nivel y la puntuación, y H repite las instrucciones.',
    progreso: 'Cada ronda añade un tono más a la secuencia, hasta 8. Un error termina la partida.',
  },
  'laberinto-audio': {
    como: 'Recorres un laberinto guiándote solo por el oído. Al moverte oyes tus pasos y un golpe cuando chocas con una pared. Con Espacio suena la brújula: se oye por el canal izquierdo o derecho según hacia dónde quede la salida y es más aguda cuanto más cerca estás. Además, cada 5 segundos suena sola. Con R el lector de pantalla te dice tu posición y por dónde puedes seguir.',
    controles: 'Flechas o WASD para moverte, Espacio para la brújula, R para la posición y las salidas disponibles y H para las instrucciones.',
    progreso: 'Empiezas en la esquina de arriba a la izquierda y la salida está en la de abajo a la derecha. Hay tres tamaños: Fácil (7×7), Medio (11×11) y Difícil (15×15), cada uno con un límite de pasos. Cuantos menos pasos, más puntos, y el laberinto es distinto en cada partida.',
  },
  'pong-audio': {
    como: 'El Pong clásico, jugado de oído. La pelota suena en estéreo según su posición horizontal y con un tono más agudo o más grave según su altura. Cuando se acerca a tu paleta, el sonido se repite más a menudo, como un sensor de aparcamiento. Tu paleta, la del rival y los rebotes en las paredes suenan distinto. Con Espacio oyes dónde está la pelota en ese momento.',
    controles: 'Flechas arriba y abajo, o W y S, para mover tu paleta, que es la de la izquierda. Espacio para escuchar la posición de la pelota y H para las instrucciones.',
    progreso: 'Gana quien llegue primero a 7 puntos. En Fácil, Medio y Difícil la pelota va más rápida y el rival reacciona mejor, y la puntuación sube con la dificultad.',
  },
  'secuencias': {
    como: 'Tienes que cruzar un puente de plataformas de cristal. Antes de saltar escuchas los tonos de cada fila: un tono agudo es una plataforma segura y uno grave, una plataforma que se rompe. Se juega con la memoria auditiva: primero escuchas, luego saltas.',
    controles: 'Flecha izquierda o A y flecha derecha o D para saltar a la plataforma de ese lado.',
    progreso: 'Tres dificultades según la longitud del puente: 5 saltos en Fácil, 8 en Medio y 12 en Difícil.',
  },

  // ── Palabras y números ─────────────────────────────────────────────────────
  'hangman': {
    como: 'El Ahorcado de siempre. Pulsas una letra y el lector de pantalla te dice si está en la palabra y cómo va quedando, con los huecos que faltan, y cuántos intentos te quedan. Un sonido distinto marca el acierto y el fallo, así que no hace falta mirar el dibujo.',
    controles: 'Pulsa cualquier letra del teclado para probarla. El botón «Pedir pista» te da una pista a cambio de 5 puntos. Como todas las letras sirven para jugar, los atajos van con números: 1 repite las instrucciones y 2 relee la palabra y las letras usadas.',
    progreso: 'Tienes 6 intentos fallidos antes de perder.',
  },
  'mastermind': {
    como: 'El Mastermind con números, también conocido como Toros y Vacas, es ideal para jugar con lector de pantalla porque todo es texto. Escribes un número y el juego te responde cuántos toros (cifras correctas en su sitio) y cuántas vacas (cifras correctas en otro sitio) tiene. Con R vuelves a escuchar el estado.',
    controles: 'Escribe tu intento de 4 cifras y pulsa Enter o el botón «Intentar». R relee el estado y H repite las instrucciones.',
    progreso: 'El número secreto tiene 4 cifras distintas y tienes 10 intentos para adivinarlo.',
  },
  'wordle': {
    como: 'Wordle en español. Los colores de la versión original no sirven si no ves la pantalla, así que aquí el lector de pantalla te lee el resultado de cada intento letra a letra: si está en su sitio, si está en la palabra pero en otro sitio o si no está. Con la tecla 2 vuelves a escuchar el último resultado cuando quieras.',
    controles: 'Escribe la palabra con el teclado (o con los botones en pantalla) y pulsa Enter. 2 relee el último resultado y 1 repite las instrucciones.',
    progreso: 'Tienes 6 intentos para adivinar una palabra de 5 letras.',
  },
  'mates-rapidas': {
    como: 'El lector de pantalla te lee cada operación y tú escribes el resultado. Un sonido indica si has acertado o fallado, y el tictac del reloj te avisa de que se acaba el tiempo. Con R vuelves a escuchar la operación y el estado.',
    controles: 'Escribe el resultado y pulsa Enter. R relee el estado y H repite las instrucciones.',
    progreso: 'Son 15 operaciones con 3 vidas: pierdes una por cada error o cada vez que se acaba el tiempo. En Fácil hay sumas y restas hasta 10 con 12 segundos por operación; en Medio, también multiplicaciones, con 9 segundos; en Difícil, las cuatro operaciones con 6 segundos.',
  },
  'anagramas': {
    como: 'El juego te da una palabra con las letras desordenadas y tienes que escribir la original. El lector de pantalla te lee la palabra desordenada y el tiempo que queda, y con R vuelves a escucharla cuando quieras. Un sonido indica si has acertado y el tictac te avisa del tiempo.',
    controles: 'Escribe la palabra y pulsa Enter; puedes intentarlo varias veces. El botón «Pista» te lee la definición de la palabra a cambio de unos puntos. R relee la palabra y H repite las instrucciones.',
    progreso: 'Tienes 20 segundos por palabra.',
  },

  // ── Puzles y lógica ────────────────────────────────────────────────────────
  'buscaminas': {
    como: 'Al revelar una celda suena un tono que te da la información de un vistazo: agudo y suave si no hay minas alrededor, grave y áspero si hay muchas. Al moverte, el cursor se anuncia solo (oculta, número o marcada), y cuando una celda vacía abre un área entera suena un acorde ascendente. La tecla E lee la celda actual y sus ocho vecinas, que es lo que necesitas para deducir dónde están las minas.',
    controles: 'Flechas o WASD para mover el cursor, Enter o Espacio para revelar, F para poner o quitar una bandera. E para leer la celda y sus vecinas, R para saber cuántas minas quedan sin marcar y cuántas celdas faltan, H para las instrucciones.',
    progreso: 'Tres tamaños: Fácil (9×9, 10 minas), Medio (12×12, 25 minas) y Difícil (16×16, 40 minas).',
  },
  'sokoban': {
    como: 'Empujas cajas por un almacén hasta colocarlas en las metas. Cada cosa tiene su sonido: un paso, empujar una caja, chocar con la pared, colocar una caja en su meta o sacarla de ella. La tecla E describe lo que tienes alrededor, así que puedes hacerte el mapa mental del nivel sin verlo.',
    controles: 'Flechas o WASD para moverte y empujar. Z deshace el último movimiento, R reinicia el nivel y E describe el entorno.',
    progreso: '10 niveles de dificultad creciente. Al empezar cada uno se te dice cuántas cajas hay que colocar, y cuantos menos movimientos uses, más puntos.',
  },
  '2048': {
    como: 'Deslizas todas las fichas a la vez hacia un lado y las que tienen el mismo número se fusionan. Cada fusión suena con una nota más aguda cuanto mayor es la ficha, así que oyes cómo vas progresando; si el movimiento no es posible, suena un aviso. El lector de pantalla te anuncia el final de la partida y cuándo llegas a 2048.',
    controles: 'Flechas o WASD para deslizar las fichas. H repite las instrucciones.',
    progreso: 'La puntuación es la suma de todas las fusiones. Al llegar a 2048 puedes seguir jugando para mejorarla, hasta que no queden movimientos.',
  },
  'quince': {
    como: 'El clásico puzle deslizante de 15 fichas. Cada ficha suena al moverse, con el sonido colocado en la columna a la que va, y un tono especial te avisa cuando una ficha llega a su sitio. La tecla E describe el hueco y las fichas de alrededor y la B lee el tablero completo.',
    controles: 'Flechas o WASD para deslizar una ficha hacia el hueco. E para explorar alrededor del hueco, B para leer el tablero entero y R para reiniciar.',
    progreso: 'Tres dificultades (Fácil, Normal y Difícil) según cuánto se desordena el tablero al empezar. Cuantos menos movimientos, mejor.',
  },

  // ── Cartas, dados y azar ───────────────────────────────────────────────────
  'blackjack': {
    como: 'Cada carta se anuncia por su nombre y su palo, junto con el valor de tu mano y la carta visible del dealer, así que sigues la partida sin ver la mesa. El reparto de cartas y el resultado tienen su sonido. Con R vuelves a escuchar tu mano.',
    controles: 'P para pedir carta, S para plantarte, D para doblar (recibes una sola carta más y, si ganas, cobras el doble) y N para una nueva partida. R relee tu mano e I repite las instrucciones.',
    progreso: 'El As vale 1 u 11 y las figuras, 10. El dealer pide hasta tener 17 o más. Se juega con puntos, no con dinero.',
  },
  'gin-rummy': {
    como: 'El lector de pantalla te lee cada carta que robas y la que descarta la IA, y te avisa de tus puntos sueltos en cada turno. Cada carta de la mano tiene una tecla del 1 al 0, así que puedes elegirla sin moverte por la pantalla. Con H oyes tu mano completa cuando quieras.',
    controles: 'En tu turno roba del mazo con M o del descarte con D; luego elige una carta con las teclas del 1 al 0 y descártala con R. L para cerrar (llamar) y G para cantar Gin. H lee tu mano, I repite las instrucciones y N empieza una partida nueva.',
    progreso: 'Forma tríos o cuartetos del mismo valor y escaleras de 3 o más cartas del mismo palo. Puedes cerrar cuando tus cartas sueltas sumen 10 puntos o menos; con 0 puntos cantas Gin y ganas una bonificación.',
  },
  'poker': {
    como: 'Texas Hold\'em contra la inteligencia artificial. El juego te anuncia tus dos cartas, las comunitarias a medida que salen (flop, turn y river), lo que apuesta el rival y quién gana cada mano y con qué jugada. Con I escuchas en cualquier momento el estado: fichas, bote y cartas.',
    controles: 'F para retirarte, C para igualar o pasar, R para subir, y + y − para ajustar la subida. I lee el estado y N reparte una mano nueva.',
    progreso: 'Empiezas con 1000 fichas y en cada mano se paga la ciega. Las jugadas van de mayor a menor: escalera de color, póker, full, color, escalera, trío, doble pareja, pareja y carta alta. Se juega con fichas ficticias, no con dinero.',
  },
  'truco': {
    como: 'El Truco argentino con la baraja española de 40 cartas, uno contra uno con la IA. El juego te lee tus tres cartas, la carta que juega la IA en cada baza y sus cantos, y te pregunta si aceptas cuando canta Envido o Truco. Con I escuchas el estado de la mano en cualquier momento.',
    controles: 'Teclas 1, 2 y 3 para jugar cada carta. E canta Envido (pulsando más veces, Real Envido y Falta Envido) y T canta Truco (y después Retruco y Vale Cuatro). Cuando canta la IA: S para aceptar, N para rechazar y T para subir el Truco. I lee el estado.',
    progreso: 'Cada mano son 3 cartas y 3 bazas; quien gana 2 bazas se lleva la mano. Gana la partida quien llega primero a 15 puntos.',
  },
  'generala': {
    como: 'La Generala, prima del Yahtzee, con cinco dados. Cada dado suena con una nota según su valor al tirarlo, y el lector de pantalla te dice el resultado de la tirada, qué dados tienes guardados y cuántos puntos daría cada categoría.',
    controles: 'R o Espacio para tirar los dados; teclas del 1 al 5 para guardar o soltar cada dado; flechas arriba y abajo para recorrer las categorías y Enter para anotar. E relee el turno y los dados, y H repite las instrucciones.',
    progreso: '13 turnos con hasta 3 tiradas cada uno. Si la sección de arriba suma 63 o más, ganas 35 puntos extra. La Generala (cinco dados iguales) vale 50 puntos, o 100 si sale en la primera tirada del turno.',
  },
  'bingo': {
    como: 'El juego canta cada bola con su letra y su número (B, I, N, G u O, del 1 al 75) y te dice si está en tu cartón. Los números se marcan solos, así que no tienes que buscarlos en la pantalla, y un sonido distinto te avisa de cuándo la bola es tuya.',
    controles: 'Espacio o Enter para pedir la siguiente bola.',
    progreso: 'El cartón es de 5×5. Ganas al completar una línea (fila, columna o diagonal) y puedes seguir hasta completar el cartón entero para cantar Bingo.',
  },
  'tragaperras': {
    como: 'Una máquina de tres rodillos pensada para el oído. Cada rodillo se para con un sonido colocado a su lado (el primero a la izquierda, el segundo en el centro y el tercero a la derecha) y el lector de pantalla te dice qué símbolo ha salido. Cada símbolo tiene su propio tono y los premios suenan distinto según su tamaño.',
    controles: 'Espacio para girar, teclas 1, 2 y 3 para retener un rodillo después de una tirada sin premio, y Q para terminar y guardar la puntuación.',
    progreso: 'Empiezas con 100 créditos ficticios; la partida acaba cuando te quedas sin ellos o cuando sales con Q. El premio mayor son tres sietes: 250 créditos.',
  },
  'solitario': {
    como: 'El Solitario Klondike, adaptado para jugarse con el teclado y el lector de pantalla. Te mueves de pila en pila y el lector de pantalla te describe cada una al llegar; con R vuelves a escucharla. Girar una carta, colocarla en su fundación o hacer un movimiento no válido tienen su sonido.',
    controles: 'Flechas izquierda y derecha para moverte entre pilas, teclas del 1 al 7 para ir a una columna, S para el mazo, W para el descarte y F para recorrer las fundaciones. Enter o Espacio para coger y dejar cartas, Escape para cancelar, A para mandar la carta a su fundación y D para robar del mazo. R describe la pila, N empieza una partida nueva e I repite las instrucciones.',
    progreso: '15 puntos por cada carta que llevas a una fundación, 5 por girar una carta oculta y 5 por pasar una carta del descarte a una columna.',
  },

  // ── Juegos de mesa ─────────────────────────────────────────────────────────
  'parchis': {
    como: 'Parchís uno contra uno contra la IA. El lector de pantalla te dice lo que sale en el dado, dónde está cada una de tus fichas y qué hace la IA en su turno. Cada ficha tiene su número, así que no hace falta buscarla en el tablero. Con I escuchas el estado completo de la partida.',
    controles: 'R para tirar el dado y teclas 1, 2, 3 y 4 para elegir qué ficha mover. I para el estado de la partida.',
    progreso: 'Juegas con las 4 fichas rojas. Necesitas un 5 para sacar una ficha de casa; el 6 y las capturas dan turno extra, y en las casillas seguras no se puede capturar. Gana quien mete antes sus 4 fichas en la meta.',
  },
  'conecta-cuatro': {
    como: 'Eliges columna con las flechas y el juego te dice si está vacía, llena o cuántas fichas tuyas y de la IA tiene. Después de cada jugada, el lector de pantalla te anuncia en qué columna ha jugado la IA. Un sonido distinto marca tu jugada, la victoria y el empate.',
    controles: 'Flechas izquierda y derecha, o A y D, para elegir columna; Enter o Espacio para soltar la ficha.',
    progreso: 'Juegas con las amarillas y la IA con las rojas. Gana quien conecte cuatro en línea: en horizontal, vertical o diagonal. La IA calcula varias jugadas por delante, así que no es fácil ganarle.',
  },
  'tres-en-raya': {
    como: 'Mueves un cursor por el tablero de 3×3 y el lector de pantalla te dice en qué casilla estás y si está libre o tiene una X o una O. La jugada de la IA se anuncia y tiene su propio sonido.',
    controles: 'Flechas para mover el cursor, Enter para poner tu marca, R para leer la casilla actual y H para las instrucciones.',
    progreso: 'Juegas con las X. La IA juega de forma perfecta: lo mejor que puedes conseguir es un empate si no fallas.',
  },
  'batalla-naval': {
    como: 'El tablero de 10×10 se recorre con un cursor y el lector de pantalla te dice la casilla, con columnas de la A a la J y filas del 1 al 10, como en el juego de papel. Un disparo acertado suena a explosión y uno fallido a chapoteo; los disparos de la IA a tu flota tienen sus propios sonidos, y hundir un barco suena distinto. Con R escuchas la casilla actual y el estado de las flotas.',
    controles: 'Al colocar los barcos: flechas para mover el cursor, R para girar el barco, Enter para colocarlo o A para que se coloquen solos. Al atacar: flechas para apuntar al tablero enemigo y Enter para disparar. R relee la casilla y el estado; H repite las instrucciones.',
  },

  // ── Aventuras de texto ─────────────────────────────────────────────────────
  'misterio': {
    como: 'Una novela de detectives en la que tú haces las preguntas. Lord Blackwood ha muerto envenenado y tienes que descubrir quién lo hizo recorriendo la mansión, examinando objetos e interrogando a cinco sospechosos. Todo es texto, así que el lector de pantalla te lee cada lugar, cada declaración y cada pista. El culpable cambia en cada partida.',
    controles: 'Escribe la orden y pulsa Enter: «ir a» un lugar (entrada, biblioteca, salón, cocina, jardín, despacho o habitación), «examinar» o «examinar» y un objeto, «hablar con» un sospechoso (Víctor, Isabela, Vidal, Clara o Thomas), «pistas» para repasar tu expediente, «sospechosos» para saber quién está dónde y «mirar» para releer el lugar. Las flechas arriba y abajo recuperan las órdenes anteriores.',
    progreso: 'Cuando creas tener pruebas suficientes, escribe «acusar a» y el nombre. Si te equivocas, el culpable escapa.',
  },
  'aventura-texto': aventura({
    ambiente: 'Una aventura clásica de mazmorra: 49 salas, la historia de quien vivió allí y el Liche Oscuro esperando al final.',
    zonas: 'una sala',
    jefe: 'el Liche',
    curar: 'poción',
    arma: 'la espada',
    defensa: 'El escudo',
    llave: 'la llave',
    fuerte: 'El Guerrero',
    magia: { quien: 'El Mago', orden: 'magia', efecto: 'lanzar un ataque arcano' },
    explorar: { quien: 'El Explorador', orden: 'explorar' },
  }),
  'aventura-espacio': aventura({
    ambiente: 'Ciencia ficción en la estación espacial UES Kronos: 49 secciones abandonadas, una tripulación desaparecida y el Vórtex Primario al fondo.',
    zonas: 'una sección',
    jefe: 'el Vórtex Primario',
    curar: 'kit',
    arma: 'la pistola de plasma',
    defensa: 'El escudo energético',
    llave: 'la tarjeta de acceso',
    fuerte: 'El Comandante',
    magia: { quien: 'El Ingeniero', orden: 'hackear', efecto: 'lanzar un ataque de código' },
    explorar: { quien: 'El Explorador Espacial', orden: 'escanear' },
  }),
  'abismo': aventura({
    ambiente: 'Una aventura submarina: 49 zonas de unas ruinas hundidas en el fondo del océano y el Leviatán del Abismo como enemigo final.',
    zonas: 'una zona',
    jefe: 'el Leviatán',
    curar: 'oxígeno',
    arma: 'el arpón legendario',
    defensa: 'El traje de presión',
    llave: 'la baliza de frecuencia',
    fuerte: 'El Comandante',
    magia: { quien: 'La Bióloga Marina', orden: 'sonar', efecto: 'lanzar un pulso de sonar' },
    explorar: { quien: 'El Explorador de Profundidades', orden: 'sondear' },
  }),
  'bagdad': aventura({
    ambiente: 'Las Mil y Una Noches: 49 zonas de Bagdad y de un palacio maldito, con djinns, guardianes y el Califa de las Sombras.',
    zonas: 'una zona',
    jefe: 'el Califa',
    curar: 'dátiles',
    arma: 'la cimitarra de Sinbad',
    defensa: 'El velo encantado',
    llave: 'la Lámpara de Aladino',
    fuerte: 'El Guerrero del Desierto',
    magia: { quien: 'La Hechicera', orden: 'conjuro', efecto: 'lanzar un hechizo del libro de los djinns' },
    explorar: { quien: 'El Ladrón de Bagdad', orden: 'sombra' },
  }),
  'castillo': aventura({
    ambiente: 'Terror gótico: 49 estancias del castillo maldito del Conde Vordrak, cuyo espíritu inmortal tienes que exorcizar.',
    zonas: 'una estancia',
    jefe: 'el Conde',
    curar: 'elixir',
    arma: 'la estaca de roble sagrado',
    defensa: 'La capa encantada',
    llave: 'el crucifijo de plata',
    fuerte: 'El Cazador',
    magia: { quien: 'La Médium', orden: 'luz', efecto: 'proyectar luz sagrada' },
    explorar: { quien: 'El Alquimista', orden: 'analizar' },
  }),
  'china': aventura({
    ambiente: 'La China imperial: 49 zonas del Palacio Prohibido, corrompido por el Dragón del Cielo Oscuro.',
    zonas: 'una zona',
    jefe: 'el Dragón del Cielo',
    curar: 'té',
    arma: 'el Sable del General Zhang',
    defensa: 'La armadura de seda imperial',
    llave: 'el Sello Imperial',
    fuerte: 'El Guerrero Imperial',
    magia: { quien: 'La Hechicera del Dragón', orden: 'dragón', efecto: 'invocar al Dragón Blanco' },
    explorar: { quien: 'El Espía de la Seda', orden: 'sombra' },
  }),
  'corp': aventura({
    ambiente: 'Cyberpunk: 49 sectores de la Torre Nexus, sus defensas y un Director a punto de activar el Protocolo Omega.',
    zonas: 'un sector',
    jefe: 'el Director',
    curar: 'stim',
    arma: 'la monokatana',
    defensa: 'El blindaje cibernético',
    llave: 'el chip de acceso',
    fuerte: 'El Mercenario',
    magia: { quien: 'El Netrunner', orden: 'hackear', efecto: 'lanzar un exploit neural' },
    explorar: { quien: 'El Espía Corporativo', orden: 'infiltrar' },
  }),
  'egipto': aventura({
    ambiente: 'El antiguo Egipto: 49 cámaras de la tumba de Amenhotep III, llenas de trampas, y el espíritu inmortal del faraón.',
    zonas: 'una cámara',
    jefe: 'el faraón',
    curar: 'elixir',
    arma: 'el khopesh sagrado',
    defensa: 'El pectoral de Horus',
    llave: 'el escarabajo de jade',
    fuerte: 'La Arqueóloga',
    magia: { quien: 'El Sacerdote de Ra', orden: 'invocar ra', efecto: 'lanzar un ataque divino' },
    explorar: { quien: 'El Ladrón de tumbas', orden: 'acechar' },
  }),
  'grecia': aventura({
    ambiente: 'La Grecia mitológica: 49 zonas del laberinto del Olimpo, criaturas de leyenda y Cronos, el Titán del Tiempo.',
    zonas: 'una zona',
    jefe: 'Cronos',
    curar: 'ambrosía',
    arma: 'la espada de Hefesto',
    defensa: 'El peplos de Atenea',
    llave: 'el Sello del Olimpo',
    fuerte: 'El Héroe',
    magia: { quien: 'La Sacerdotisa de Atenea', orden: 'egida', efecto: 'invocar la Égida divina' },
    explorar: { quien: 'El Ladrón del Olimpo', orden: 'sigilo' },
  }),
  'inca': aventura({
    ambiente: 'El Imperio Inca: 49 zonas de los Andes y de una ciudadela perdida, con Supay, el Dios de la Muerte, al final.',
    zonas: 'una zona',
    jefe: 'Supay',
    curar: 'chicha',
    arma: 'el hacha ceremonial',
    defensa: 'El escudo ceremonial',
    llave: 'el quipu ceremonial',
    fuerte: 'El Guerrero Inca',
    magia: { quien: 'La Sacerdotisa del Sol', orden: 'oracion', efecto: 'invocar la luz de Inti' },
    explorar: { quien: 'El Ladrón de Oro', orden: 'acechar' },
  }),
  'oeste': aventura({
    ambiente: 'El Lejano Oeste: 49 zonas de un pueblo y un fortín malditos, forajidos, criaturas del desierto y Deadwood Jack, el Forajido Inmortal.',
    zonas: 'una zona',
    jefe: 'Deadwood Jack',
    curar: 'whisky',
    arma: 'el revólver de plata',
    defensa: 'El chaleco de cuero',
    llave: 'la placa del Sheriff',
    fuerte: 'El Pistolero',
    magia: { quien: 'La Curandera Apache', orden: 'ritual', efecto: 'invocar a los espíritus ancestrales' },
    explorar: { quien: 'El Buscador de Oro', orden: 'rastrear' },
  }),
  'pirata': aventura({
    ambiente: 'Piratas: 49 zonas de la Isla Maldita, el paradero del Gran Tesoro y el Corsario Negro.',
    zonas: 'una zona',
    jefe: 'el Corsario Negro',
    curar: 'botiquín',
    arma: 'el sable de ébano',
    defensa: 'El escudo de cuero',
    llave: 'el mapa del tesoro',
    fuerte: 'El Capitán',
    magia: { quien: 'La Bruja del Mar', orden: 'maldecir', efecto: 'lanzar un hechizo' },
    explorar: { quien: 'El Navegante', orden: 'explorar' },
  }),
  'rusia': aventura({
    ambiente: 'La Rusia de los cuentos eslavos: 49 zonas del palacio del Zar, corrompido por Koschei el Inmortal.',
    zonas: 'una zona',
    jefe: 'Koschei',
    curar: 'manzana',
    arma: 'la Espada del Bogatyr',
    defensa: 'La Capa de Baba Yaga',
    llave: 'el Huevo de Koschei',
    fuerte: 'El Bogatyr',
    magia: { quien: 'La Hechicera del Bosque', orden: 'pájaro', efecto: 'invocar al Pájaro de Fuego' },
    explorar: { quien: 'El Ladrón del Zar', orden: 'sombra' },
  }),
  'samurai': aventura({
    ambiente: 'El Japón feudal: 49 estancias del castillo Kurogane, un feudo deshonrado y el Shogun usurpador.',
    zonas: 'una estancia',
    jefe: 'el Shogun',
    curar: 'medicina',
    arma: 'la katana legendaria',
    defensa: 'La armadura de laca negra',
    llave: 'el sello del daimyo',
    fuerte: 'El Samurái',
    magia: { quien: 'El Ninja', orden: 'sombra', efecto: 'lanzar una técnica secreta' },
    explorar: { quien: 'El Monje guerrero', orden: 'meditar' },
  }),
  'templo': aventura({
    ambiente: 'Arqueología en la selva: 49 zonas de jungla y de un templo maya perdido, custodiado por el Dios Serpiente Kukulkán.',
    zonas: 'una zona',
    jefe: 'Kukulkán',
    curar: 'poción',
    arma: 'el machete de obsidiana',
    defensa: 'El amuleto de jade',
    llave: 'el glifo sagrado',
    fuerte: 'El Explorador',
    magia: { quien: 'El Chamán', orden: 'maldicion', efecto: 'lanzar una maldición ancestral' },
    explorar: { quien: 'La Arqueóloga', orden: 'descifrar' },
  }),
  'vikingos': aventura({
    ambiente: 'El norte vikingo: 49 salas del fortín Haraldur, un clan maldito por Loki y el Jarl Oscuro.',
    zonas: 'una sala',
    jefe: 'el Jarl Oscuro',
    curar: 'hidromiel',
    arma: 'el hacha de guerra legendaria',
    defensa: 'El escudo nórdico',
    llave: 'la runa del clan',
    fuerte: 'El Guerrero',
    magia: { quien: 'El Escaldo', orden: 'runas', efecto: 'entonar un canto rúnico' },
    explorar: { quien: 'El Berserker', orden: 'rabia' },
  }),
  'zona': aventura({
    ambiente: 'Un páramo postapocalíptico: 49 zonas con raiders, mutantes y el Señor de la Zona.',
    zonas: 'una zona',
    jefe: 'el Señor de la Zona',
    curar: 'botiquín',
    arma: 'el rifle de precisión',
    defensa: 'La armadura de placas',
    llave: 'la tarjeta de acceso',
    fuerte: 'El Soldado',
    magia: { quien: 'La Médica de Campo', orden: 'toxina', efecto: 'lanzar un ataque químico' },
    explorar: { quien: 'El Saqueador', orden: 'rastrear' },
  }),
  'casa-encantada': {
    como: 'Una aventura de texto de terror en la Mansión Voss: 36 habitaciones y el Espectro del Amo esperando. Todo es texto, así que el lector de pantalla te lee cada habitación, lo que hay en ella y sus salidas, y tú respondes escribiendo. Aquí no basta con cuidar la vida: también tienes que vigilar tu cordura, porque si llega a cero la partida termina igual que si te quedas sin vida.',
    controles: 'Escribe la orden y pulsa Enter: «ir norte» (o sur, este, oeste), «mirar», «inventario» (vida, cordura y objetos), «tomar» y «usar botiquín» para curarte. En combate, «atacar» o «huir»; del Espectro del Amo no se puede huir. Las flechas arriba y abajo recuperan las órdenes anteriores y H repite las instrucciones.',
    progreso: 'El Cazador tiene más vida y daño, y con la escopeta hace el doble de daño al Amo. La Médium tiene más cordura y escribe «ritual» en combate para un exorcismo cada 3 turnos. El Ladrón escribe «acechar» para ver las habitaciones de alrededor. El crucifijo reduce el daño del jefe y la Reliquia de Luz lo triplica. La partida se guarda sola en el navegador.',
  },
  'aventura-magica': {
    como: 'Fantasía medieval en el reino de Eloria: el Dragón de las Sombras ha roto el Cristal Eterno y tienes que reunir sus 3 fragmentos para poder enfrentarte a él. Todo es texto, así que el lector de pantalla te lee cada sala y tú respondes escribiendo. Con «inventario» oyes tu vida, los fragmentos que llevas y tus objetos.',
    controles: 'Escribe la orden y pulsa Enter: «ir norte» (o sur, este, oeste), «mirar», «inventario», «tomar» y «usar poción» para curarte. En combate, «atacar» o «huir»; del Dragón no se puede huir. Las flechas arriba y abajo recuperan las órdenes anteriores y H repite las instrucciones.',
    progreso: 'Eliges entre tres personajes. El Paladín escribe «curar» en combate para recuperar 30 puntos de vida, una vez por batalla. La Hechicera lanza «hechizo» cada 3 turnos. El Ladrón usa «sigilo» para evitar el suceso de una sala, «robar» en combate para ganar puntos y detecta las trampas. La puerta del Dragón no se abre hasta que tienes los 3 fragmentos, y con ellos le haces daño extra.',
  },
}
