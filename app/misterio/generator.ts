// ─── Types ────────────────────────────────────────────────────────────────────

export type SuspectId = 'victor' | 'isabela' | 'vidal' | 'clara' | 'thomas'
export type LocationId = 'entrada' | 'biblioteca' | 'salon' | 'cocina' | 'jardin' | 'despacho' | 'habitacion'
export type ClueId =
  | 'veneno_copa' | 'veneno_botella'
  | 'diario_motivo' | 'doc_quemado' | 'doc_formal'
  | 'evidencia_medios' | 'testimonio_a' | 'coartada_falsa'
  | 'dato_acceso'

export const KEY_EVIDENCE: ClueId[] = [
  'veneno_copa', 'veneno_botella', 'diario_motivo', 'doc_quemado',
  'doc_formal', 'evidencia_medios', 'testimonio_a', 'coartada_falsa',
]

export interface GeneratedObject   { name: string; desc: string; clue?: ClueId }
export interface GeneratedLocation { name: string; desc: string; exits: LocationId[]; objects: Record<string, GeneratedObject>; suspects: SuspectId[] }
export interface GeneratedGame     { culprit: SuspectId; locations: Record<LocationId, GeneratedLocation>; clues: Record<ClueId, { name: string; desc: string }>; statements: Record<SuspectId, Array<{ text: string; clue?: ClueId }>>; resolution: string }

// ─── Static structure ─────────────────────────────────────────────────────────

export const SUSPECT_NAMES: Record<SuspectId, string> = {
  victor: 'Víctor Crane', isabela: 'Isabela Blackwood',
  vidal: 'Dr. Marcos Vidal', clara: 'Clara Mendez', thomas: 'Thomas Reed',
}

export const SUSPECT_LOCATIONS: Record<SuspectId, LocationId> = {
  victor: 'entrada', isabela: 'habitacion', vidal: 'salon', clara: 'cocina', thomas: 'jardin',
}

export const LOCATION_NAMES: Record<LocationId, string> = {
  entrada: 'Entrada de la Mansión', biblioteca: 'Biblioteca (Escena del crimen)',
  salon: 'Salón Principal', cocina: 'Cocina', jardin: 'Jardín Trasero',
  despacho: 'Despacho Privado', habitacion: 'Habitación de Isabela',
}

export const LOCATION_EXITS: Record<LocationId, LocationId[]> = {
  entrada:    ['biblioteca', 'salon', 'cocina', 'jardin', 'habitacion'],
  biblioteca: ['entrada', 'despacho'],
  salon: ['entrada'], cocina: ['entrada'], jardin: ['entrada'],
  despacho: ['biblioteca'], habitacion: ['entrada'],
}

export const LOCATION_SUSPECTS: Record<LocationId, SuspectId[]> = {
  entrada: ['victor'], biblioteca: [], salon: ['vidal'],
  cocina: ['clara'], jardin: ['thomas'], despacho: [], habitacion: ['isabela'],
}

const LOC_DESC: Record<LocationId, string> = {
  entrada:    'El hall de la mansión Blackwood. Un agente custodia la puerta. Sobre la mesa hay un registro de visitas. Víctor Crane, el mayordomo, espera de pie junto a la escalera.',
  biblioteca: 'La sala donde ocurrió todo. Lord Blackwood yace junto a su escritorio. Hay una copa de cristal volcada y su diario abierto sobre la mesa. La sala huele a algo amargo.',
  salon:      'Amplio salón con chimenea encendida. El Dr. Marcos Vidal espera sentado en un sillón. En las paredes hay varios retratos de la familia Blackwood.',
  cocina:     'Huele a comida recién preparada. Clara Mendez limpia los platos en silencio. Sobre la encimera hay una botella de vino y el rack de copas.',
  jardin:     'El jardín de la mansión en la noche. Thomas Reed recoge sus herramientas junto al cobertizo. Desde el banco de piedra se domina toda la fachada trasera.',
  despacho:   'El despacho privado de Lord Blackwood. Mesita con una botella de vino especial y dos copas, una usada. Sobre el escritorio hay una carta.',
  habitacion: 'La habitación de la sobrina. Ordenada pero tensa. Isabela Blackwood está sentada al borde de la cama.',
}

// ─── Data pools ───────────────────────────────────────────────────────────────

interface MotiveEntry {
  culprit: SuspectId
  clueLabel: string; clueDesc: string
  diary: string     // Lord Blackwood's last diary entry
  chimenea: string  // fragment readable in burned document
  carta: string     // formal document in despacho
  resolution: string // why they did it (third person, one sentence)
}

interface MeansEntry {
  culprit: SuspectId
  location: LocationId; objectKey: string; objectName: string; objDesc: string
  clueLabel: string; clueDesc: string
  resolution: string // how they obtained / used the poison
}

const MOTIVES: MotiveEntry[] = [
  // ── Víctor ──
  { culprit: 'victor', clueLabel: 'Despido de Víctor sin compensación',
    clueDesc: 'Lord Blackwood iba a despedir a Víctor tras veinte años de servicio, sin indemnización ni aviso.',
    diary: 'Debo hablar con Víctor mañana. Su rendimiento ha decaído y ya no es quien era. He redactado la carta de despido. Me temo que no lo tomará bien; ha entregado su vida entera a esta mansión.',
    chimenea: 'Carta de despido — Víctor Crane — rescisión inmediata — sin indemnización por causa mayor',
    carta: 'Carta de Lord Blackwood a Víctor Crane: rescisión de su contrato de servicio con efectos a partir del lunes. Sin indemnización. El señor iba a comunicárselo personalmente.',
    resolution: 'Víctor Crane descubrió que iba a ser despedido sin compensación tras veinte años de servicio.' },

  { culprit: 'victor', clueLabel: 'Fraude en la bodega descubierto',
    clueDesc: 'Lord Blackwood descubrió que Víctor vendía botellas de la bodega a terceros desde hacía años.',
    diary: 'He revisado el inventario de la bodega. Faltan cuarenta y siete botellas de alto valor. El único con acceso y autoridad es Víctor. Mañana lo confrontaré con los datos del inventario.',
    chimenea: 'Inventario de bodega con anotaciones. Firmas de retirada no autorizadas a nombre de Víctor Crane. Importe estimado: 9.000 €',
    carta: 'Informe de inventario de la bodega Blackwood: 47 botellas de vino de alto valor desaparecidas en dos años. El acceso exclusivo corresponde al mayordomo Víctor Crane.',
    resolution: 'Víctor Crane llevaba años sustrayendo vino de la bodega y Lord Blackwood acababa de descubrirlo.' },

  { culprit: 'victor', clueLabel: 'Manipulación del testamento',
    clueDesc: 'Víctor interceptaba correspondencia del abogado y había manipulado cláusulas del testamento a su favor.',
    diary: 'Mi abogado me ha alertado: alguien ha manipulado el testamento desde dentro. Las modificaciones apuntan al personal de la casa. Esta noche hablaré con Víctor directamente.',
    chimenea: 'Copia del testamento con anotaciones a mano en los márgenes. Cambios en la cláusula de legados al personal. Caligrafía de Víctor Crane.',
    carta: 'Carta urgente del abogado a Lord Blackwood alertando de modificaciones no autorizadas en su testamento, que favorecen al mayordomo Víctor Crane con una suma considerable.',
    resolution: 'Víctor Crane manipuló el testamento de Lord Blackwood para obtener un legado fraudulento, y el señor estaba a punto de descubrirlo.' },

  // ── Isabela ──
  { culprit: 'isabela', clueLabel: 'Deudas de juego e inminente desheredación',
    clueDesc: 'Isabela debía 50.000 € en casas de juego y su tío amenazaba con excluirla del testamento.',
    diary: 'Debo confrontar a Isabela. Sus deudas de juego superan los 50.000 €. Si no rectifica, la excluiré del testamento. Temo que, al saberlo, tome una decisión desesperada.',
    chimenea: 'Casa de Juegos La Fortuna — Préstamo de emergencia a nombre de Isabela Blackwood — 50.000 € — vencimiento inmediato',
    carta: 'Carta del bufete Fernández y Asociados a Isabela Blackwood: la deuda de 50.000 € venció hace tres meses. Sin pago antes del viernes, se notificará a la familia y se iniciarán acciones legales.',
    resolution: 'Isabela Blackwood enfrentaba 50.000 € de deudas de juego y la amenaza de ser desheredada por su tío.' },

  { culprit: 'isabela', clueLabel: 'Herencia bloqueada por nuevo testamento',
    clueDesc: 'Lord Blackwood modificó el testamento: la mansión y el patrimonio irían a una fundación, dejando a Isabela con una pensión mínima.',
    diary: 'He tomado la decisión de modificar el testamento. Isabela recibirá una renta vitalicia modesta, pero la mansión y el capital pasarán a la Fundación Blackwood. Mañana se lo comunicaré.',
    chimenea: 'Borrador del nuevo testamento. Cláusula principal: mansión y patrimonio a la Fundación Blackwood. Isabela Blackwood: pensión vitalicia de 800 € mensuales.',
    carta: 'Carta del abogado de Lord Blackwood confirmando la modificación del testamento. Isabela Blackwood pierde el derecho a la mansión y al capital principal, reducida a una pensión.',
    resolution: 'Lord Blackwood modificó su testamento, eliminando a Isabela como heredera principal y dejándole sólo una pensión mínima.' },

  { culprit: 'isabela', clueLabel: 'Venta de secretos familiares a la prensa',
    clueDesc: 'Isabela vendía fotos y cartas privadas de la familia a la prensa del corazón, y Lord Blackwood lo descubrió.',
    diary: 'He recibido pruebas de que Isabela lleva meses filtrando fotografías y correspondencia privada de la familia a la prensa. Mañana la confrontaré. Si lo confirma, actuaremos legalmente.',
    chimenea: 'Recortes de prensa con fotografías privadas de la familia Blackwood. Anotación: "fuente: I.B." Tarifa por exclusiva: 8.000 €.',
    carta: 'Carta del abogado sobre una posible demanda por revelación de información confidencial familiar. Las pruebas señalan a un miembro de la familia como fuente de las filtraciones.',
    resolution: 'Isabela Blackwood vendía información privada de la familia a la prensa, y su tío acababa de descubrirlo con pruebas.' },

  // ── Vidal ──
  { culprit: 'vidal', clueLabel: 'Negligencia médica encubierta con certificado falso',
    clueDesc: 'Vidal falsificó el certificado de defunción del hermano de Lord Blackwood para encubrir su negligencia.',
    diary: 'El doctor Vidal no sabe que he descubierto la verdad sobre la muerte de mi hermano. Falsificó el certificado para encubrir su negligencia. Esta noche lo confrontaré. Mañana iré a las autoridades.',
    chimenea: 'Informe médico — negligencia — certificado de defunción falsificado — Dr. M. Vidal — caso del paciente Blackwood, 2021',
    carta: 'Denuncia redactada por Lord Blackwood ante la Junta Médica contra el Dr. Marcos Vidal por falsificación del certificado de defunción de su hermano. Lista para ser enviada esta mañana.',
    resolution: 'El Dr. Vidal falsificó el certificado de defunción del hermano de Lord Blackwood para encubrir una negligencia, y el señor estaba a punto de denunciarle.' },

  { culprit: 'vidal', clueLabel: 'Recetas fraudulentas de sustancias controladas',
    clueDesc: 'Vidal emitía recetas falsas de sustancias controladas y Lord Blackwood tenía documentación suficiente para denunciarle.',
    diary: 'Tengo en mi poder pruebas de que el doctor Vidal ha estado emitiendo recetas falsas de sustancias controladas. Esta noche se lo haré saber y le daré la oportunidad de entregarse él mismo.',
    chimenea: 'Fotocopias de recetas médicas. Nombres de sustancias controladas. Firma del Dr. Vidal. Fechas que no corresponden a consultas reales.',
    carta: 'Informe recopilado por Lord Blackwood: prescripciones irregulares firmadas por el Dr. Marcos Vidal. Suficiente para iniciar una investigación penal por tráfico de sustancias.',
    resolution: 'El Dr. Vidal emitía recetas fraudulentas de sustancias controladas y Lord Blackwood reunió evidencia suficiente para hundirle.' },

  { culprit: 'vidal', clueLabel: 'Deuda de 30.000 € y demanda inminente',
    clueDesc: 'Vidal debía 30.000 € a Lord Blackwood desde hacía un año y el señor iba a presentar demanda judicial.',
    diary: 'El doctor Vidal me debe 30.000 € de un préstamo personal. Ha ignorado todos mis requerimientos. Esta noche le doy un ultimátum: pago esta semana o inicio acciones legales mañana mismo.',
    chimenea: 'Contrato de préstamo privado — Dr. Marcos Vidal — 30.000 € — vencido hace doce meses — incumplimiento reiterado',
    carta: 'Contrato de préstamo personal entre Lord Blackwood y el Dr. Marcos Vidal: 30.000 € con vencimiento hace doce meses. Anotación del señor: "siguiente paso: demanda judicial."',
    resolution: 'El Dr. Vidal debía 30.000 € a Lord Blackwood y, ante la inminente demanda judicial, decidió actuar.' },

  // ── Clara ──
  { culprit: 'clara', clueLabel: 'Desfalco de cuentas del hogar',
    clueDesc: 'Clara desvió más de 12.000 € de las cuentas domésticas en dos años y Lord Blackwood lo descubrió con una auditoría.',
    diary: 'He revisado las cuentas del hogar con el auditor. Más de 12.000 € desaparecidos en dos años. La única persona con acceso directo es Clara. Mañana la confrontaré y, si confirma lo que sospecho, llamaré a la policía.',
    chimenea: 'Informe de auditoría — irregularidades contables — 12.340 € desaparecidos — responsable de compras domésticas — período 2022-2024',
    carta: 'Informe de auditoría del hogar Blackwood: 12.340 € desviados en el período 2022-2024, atribuibles a la persona responsable de las compras y los pagos domésticos.',
    resolution: 'Clara Mendez llevaba dos años desviando fondos del hogar y Lord Blackwood contrató una auditoría que lo descubrió todo.' },

  { culprit: 'clara', clueLabel: 'Credenciales falsas al ser contratada',
    clueDesc: 'Clara fue contratada con referencias y experiencia falsificadas, y Lord Blackwood acababa de recibir la verificación negativa.',
    diary: 'La agencia de verificación ha confirmado mis sospechas: las referencias de Clara Mendez son completamente falsas. El nombre es real pero la experiencia está fabricada. Mañana tendré una conversación muy seria con ella.',
    chimenea: 'Carta de agencia de verificación de referencias: las credenciales presentadas por Clara Mendez son falsas. Ninguno de los establecimientos citados la recuerda.',
    carta: 'Informe de verificación de antecedentes laborales: Clara Mendez presentó referencias y experiencia laboral falsificadas al ser contratada hace tres años. Implicaciones legales pendientes de valorar.',
    resolution: 'Clara Mendez fue contratada con credenciales falsas y Lord Blackwood acababa de recibir la confirmación que la dejaría sin trabajo y con cargos legales.' },

  { culprit: 'clara', clueLabel: 'Espionaje doméstico a terceros',
    clueDesc: 'Clara filtraba información confidencial del hogar (horarios, visitas, movimientos de dinero) a un tercero desconocido.',
    diary: 'Un investigador privado me ha entregado el informe: Clara lleva meses pasando información confidencial de la mansión a alguien externo. Horarios, visitas, cuentas bancarias. Esta noche le haré saber que lo sé todo.',
    chimenea: 'Notas manuscritas con horarios detallados de Lord Blackwood, visitas y movimientos de fondos. Caligrafía identificada como de Clara Mendez.',
    carta: 'Informe del investigador privado contratado por Lord Blackwood: Clara Mendez ha transmitido información confidencial del hogar a un tercero no identificado durante los últimos nueve meses.',
    resolution: 'Clara Mendez espiaba la mansión y vendía información confidencial a un tercero, y Lord Blackwood tenía el informe del detective en su poder.' },

  // ── Thomas ──
  { culprit: 'thomas', clueLabel: 'Expropiación de tierras familiares con soborno',
    clueDesc: 'Lord Blackwood sobornó al ayuntamiento para expropiar las tierras de la familia Reed al precio mínimo.',
    diary: 'He decidido proceder con la adquisición de los terrenos Reed. El alcalde cooperará a cambio de la donación habitual. La familia recibirá la indemnización mínima legal. No me siento orgulloso de esto, pero el negocio lo requiere.',
    chimenea: 'Acuerdo urbanístico — parcela Reed — adquisición forzosa — precio mínimo de tasación — Lord E. Blackwood — Municipio de Blackhaven',
    carta: 'Convenio privado entre Lord Blackwood y el Municipio de Blackhaven para la adquisición forzosa de los terrenos propiedad de la familia Reed al precio mínimo de tasación. Firmado hace tres semanas.',
    resolution: 'Lord Blackwood sobornó al ayuntamiento para expropiar las tierras que la familia Reed trabajaba desde generaciones, y Thomas lo descubrió al revisar los papeles del desahucio.' },

  { culprit: 'thomas', clueLabel: 'Despido injusto con acusación falsa',
    clueDesc: 'Lord Blackwood planeaba despedir a Thomas con una acusación falsa de robo para no pagarle indemnización.',
    diary: 'He decidido que Thomas Reed debe irse. Necesito la casita del jardín para el proyecto. Usaré la acusación de "robo de material" que ya tengo preparada. Así no habrá reclamación legal posible. Es duro, pero necesario.',
    chimenea: 'Nota interna de Lord Blackwood al abogado: estrategia para el despido de Thomas Reed usando acusación de robo. Objetivo: evitar cualquier indemnización o reclamación.',
    carta: 'Carta de Lord Blackwood a su abogado instruyendo cómo formalizar el despido de Thomas Reed con una acusación fabricada de robo de material, para evitar cualquier reclamación laboral.',
    resolution: 'Lord Blackwood tramó un despido injusto con cargos falsos para echar a Thomas sin pagarle nada, y Thomas encontró los documentos que lo confirmaban.' },

  { culprit: 'thomas', clueLabel: 'Desahucio de la familia Reed',
    clueDesc: 'Lord Blackwood iba a desahuciar a la familia de Thomas de la finca donde vivían desde hacía diez años, sin compensación.',
    diary: 'He decidido no renovar el arrendamiento de la finca donde vive Thomas Reed con su familia. Necesito esa tierra para el proyecto de expansión. El aviso de desahucio vence en dos semanas. No habrá compensación adicional.',
    chimenea: 'Notificación de desahucio — Thomas Reed y familia — finca arrendada — plazo dos semanas — sin renovación ni compensación — Lord Blackwood',
    carta: 'Carta del abogado de Lord Blackwood a Thomas Reed: no renovación del arrendamiento de la finca donde reside con su familia. Plazo de desahucio: dos semanas. Sin derecho a compensación.',
    resolution: 'Lord Blackwood iba a echar a la familia de Thomas de la finca donde vivían desde hacía diez años, sin compensación de ningún tipo.' },
]

const MEANS: MeansEntry[] = [
  // ── Víctor ──
  { culprit: 'victor', location: 'cocina', objectKey: 'frasco_oculto', objectName: 'Frasco sin etiqueta',
    objDesc: 'Frasco pequeño escondido detrás de las botellas en la estantería alta de la cocina. El contenido tiene el mismo olor amargo que el residuo de la copa del crimen. Solo Víctor frecuenta ese rincón.',
    clueLabel: 'Frasco oculto en la cocina (Víctor)', clueDesc: 'Víctor escondió un frasco con el mismo veneno en su rincón exclusivo de la cocina.',
    resolution: 'Accedió al veneno a través de los productos del almacén de la mansión y lo escondió en la cocina.' },
  { culprit: 'victor', location: 'cocina', objectKey: 'botella_tapada', objectName: 'Botella con corcho de cera',
    objDesc: 'Botella sellada con cera entre las provisiones. Sin etiqueta. Al destaparlo con cuidado, el olor coincide exactamente con el alcaloide identificado en el vino del despacho.',
    clueLabel: 'Botella sellada con veneno (Víctor)', clueDesc: 'Víctor preparó y almacenó el veneno en la cocina varios días antes del crimen.',
    resolution: 'Preparó el veneno con días de antelación, almacenándolo en la cocina donde solo él tenía acceso.' },

  // ── Isabela ──
  { culprit: 'isabela', location: 'habitacion', objectKey: 'papeles', objectName: 'Papeles en el cajón',
    objDesc: 'Recibo de la Farmacia Central, de ayer por la tarde. Artículo: "alcaloide vegetal controlado". 340 €. A nombre de Isabela Blackwood.',
    clueLabel: 'Recibo de farmacia (Isabela)', clueDesc: 'Isabela compró un alcaloide vegetal controlado el día anterior al crimen.',
    resolution: 'Compró el veneno en una farmacia del pueblo el día antes del crimen, haciéndolo a su propio nombre.' },
  { culprit: 'isabela', location: 'habitacion', objectKey: 'libro_toxicologia', objectName: 'Libro de toxicología',
    objDesc: 'Libro de toxicología vegetal con marcadores en las páginas sobre dedalera y acónito. Anotaciones manuscritas de Isabela en los márgenes: dosis, síntomas, tiempo de acción.',
    clueLabel: 'Manual de toxicología anotado (Isabela)', clueDesc: 'Isabela había estudiado en detalle los venenos vegetales con anotaciones sobre dosis y acción.',
    resolution: 'Estudió sistemáticamente los venenos vegetales y preparó el compuesto con conocimiento técnico.' },

  // ── Vidal ──
  { culprit: 'vidal', location: 'salon', objectKey: 'maletin', objectName: 'Maletín del doctor',
    objDesc: 'El maletín médico de Vidal, junto al sillón. Un compartimento está abierto y vacío. La etiqueta interior reza: "Extracto de Aconitum — USO CLÍNICO EXCLUSIVO".',
    clueLabel: 'Vial vacío en el maletín de Vidal', clueDesc: 'Falta un vial de extracto de acónito del maletín de Vidal. El compuesto coincide con el veneno del crimen.',
    resolution: 'Utilizó su maletín médico para transportar el veneno, aprovechando su acceso profesional a sustancias controladas.' },
  { culprit: 'vidal', location: 'salon', objectKey: 'recetario', objectName: 'Talonario de recetas',
    objDesc: 'Talonario de recetas médicas de Vidal. Las dos últimas páginas están arrancadas. En la impresión del reverso se distingue: "Ext. Digitalis purpurea — administración oral".',
    clueLabel: 'Recetas arrancadas del talonario', clueDesc: 'Vidal arrancó dos recetas de su talonario. El reverso revela que prescribió digitalis de forma irregular.',
    resolution: 'Usó su conocimiento médico para prescribirse irregularmente el veneno y borrarlo después.' },

  // ── Clara ──
  { culprit: 'clara', location: 'cocina', objectKey: 'botella', objectName: 'Botella de vino',
    objDesc: 'La botella de vino que Clara preparó para el señor. Al agitarla, notas un precipitado oscuro inusual con el mismo aroma amargo que la copa del crimen. Solo Clara tuvo acceso antes de enviarla al despacho.',
    clueLabel: 'Botella de vino manipulada por Clara', clueDesc: 'Clara añadió el veneno al vino que ella misma preparó y envió al despacho del señor.',
    resolution: 'Añadió el veneno directamente a la botella de vino que preparaba cada noche para el señor.' },
  { culprit: 'clara', location: 'cocina', objectKey: 'frasquito', objectName: 'Frasquito entre las especias',
    objDesc: 'Pequeño frasco sin etiqueta guardado en el cajón de las especias, en el rincón exclusivo de Clara. Su contenido huele igual que el residuo de la copa del crimen.',
    clueLabel: 'Frasquito de veneno (Clara)', clueDesc: 'Veneno encontrado en el cajón exclusivo de Clara, mezclado entre las especias.',
    resolution: 'Guardaba el veneno entre sus especias y lo añadió al vino del señor antes de enviarlo al despacho.' },

  // ── Thomas ──
  { culprit: 'thomas', location: 'jardin', objectKey: 'herramientas', objectName: 'Caja de herramientas',
    objDesc: 'Caja de Thomas con herramientas de jardinería. Dentro hay un mortero con restos de planta molida. El olor es idéntico al alcaloide hallado en la copa del crimen. Thomas conoce bien las plantas tóxicas del jardín.',
    clueLabel: 'Mortero con residuo vegetal (Thomas)', clueDesc: 'El mortero de Thomas contiene el mismo veneno vegetal del crimen. Como jardinero, conoce las plantas tóxicas.',
    resolution: 'Extrajo el veneno de plantas tóxicas del propio jardín usando sus conocimientos de botánica.' },
  { culprit: 'thomas', location: 'jardin', objectKey: 'maceta', objectName: 'Maceta con planta',
    objDesc: 'Maceta con dedalera en flor, planta altamente tóxica. Hay hojas recién cortadas y el mortero junto a ella tiene residuos frescos con el mismo aroma que el veneno encontrado en el crimen.',
    clueLabel: 'Dedalera cultivada por Thomas', clueDesc: 'Thomas cultivó dedalera en el jardín y tiene residuos frescos de procesado que coinciden con el veneno.',
    resolution: 'Cultivó dedalera en el jardín y extrajo el veneno él mismo, aprovechando su formación como jardinero.' },
]

// Opportunity pool: functions(time) → what a witness observed
const OPPORTUNITY: Record<SuspectId, Array<(t: string) => string>> = {
  victor: [
    t => `Vi a Víctor salir de la cocina hacia el pasillo a las ${t}. Tardó más de media hora en regresar. Estaba visiblemente agitado al volver.`,
    t => `Vi a Víctor caminando solo por el corredor que lleva al despacho a las ${t}. No es una zona que sea la suya a esa hora.`,
    t => `Vi a Víctor junto al mueble del vino con algo en la mano a las ${t}. Lo ocultó en cuanto me vio.`,
    t => `Vi a Víctor pasar junto a la puerta del despacho a las ${t}. Se detuvo, miró a ambos lados, y entró sin llamar.`,
  ],
  isabela: [
    t => `Vi a Isabela caminando sola hacia el despacho del señor a las ${t}. El señor no recibía a nadie a esa hora.`,
    t => `Vi a Isabela preguntar directamente dónde guardaba el señor su vino especial. Cuando le indiqué el despacho, se fue sin dar explicaciones.`,
    t => `Vi a Isabela salir del despacho a las ${t} con prisa. Tenía las manos temblorosas y no me dirigió la mirada.`,
    t => `Vi a Isabela junto a la botella de vino del señor con algo pequeño en la mano. Al verme, lo cerró y lo guardó rápidamente.`,
  ],
  vidal: [
    t => `Vi al doctor salir del salón hacia el despacho a las ${t}. El sillón estuvo vacío casi veinte minutos.`,
    t => `Vi al doctor salir por la puerta lateral del despacho a las ${t} y volver apresuradamente, mirando a ambos lados.`,
    t => `Vi al doctor entrar al despacho a las ${t}. Cuando le pregunté si el señor le esperaba, dudó un momento antes de responder.`,
    t => `Vi al doctor junto a la copa del señor durante su conversación. Hizo un gesto con la mano que me llamó la atención.`,
  ],
  clara: [
    t => `Vi a Clara cruzar el jardín hacia la entrada de servicio con una botella en las manos a las ${t}. Tardó veinte minutos en volver.`,
    t => `Vi a Clara junto a la botella del señor con algo pequeño en la mano a las ${t}. Lo guardó al verme.`,
    t => `Vi a Clara salir de la cocina con la bandeja del señor a las ${t}. Tardó casi media hora en regresar, el doble de lo habitual.`,
    t => `Vi a Clara en el corredor junto al despacho a las ${t}. No tenía razón para estar allí a esa hora.`,
  ],
  thomas: [
    t => `Vi a Thomas entrar a la cocina a las ${t} cuando debería estar en el jardín. Estuvo varios minutos junto al mueble del vino.`,
    t => `Escuché a Thomas decir, antes de desaparecer un rato, que el señor "se llevaría su merecido esta noche".`,
    t => `Vi a Thomas cerca del despacho a las ${t}. Le pregunté qué hacía dentro y no respondió.`,
    t => `Vi a Thomas salir del interior de la mansión a las ${t} cuando él afirma no haber entrado nunca.`,
  ],
}

// Alibi-breaker pool: functions(time) → what a witness says to break the alibi
const ALIBI_BREAK: Record<SuspectId, Array<(t: string) => string>> = {
  victor: [
    t => `Víctor no estaba donde dice que estaba. Lo vi en el corredor hacia el despacho a las ${t}, no en la zona de servicio.`,
    t => `A las ${t} Víctor ya no estaba en su sitio habitual. Lo vi pasar por delante del despacho con paso rápido.`,
    t => `Víctor estuvo fuera de la cocina casi cuarenta minutos a partir de las ${t}. No fue ningún momento breve.`,
  ],
  isabela: [
    t => `El jardín estaba completamente solo. Isabela no estaba allí. Estuve hasta las ${t} y no vi a nadie más.`,
    t => `Cuando pasé por su habitación a las ${t}, la puerta estaba abierta y la habitación vacía, con la luz apagada.`,
    t => `Vi a Isabela en el pasillo cerca del despacho a las ${t}. No venía del jardín ni de su habitación.`,
  ],
  vidal: [
    t => `El sillón del doctor estuvo vacío durante casi veinte minutos a partir de las ${t}. Cuando volví con más té, no había nadie.`,
    t => `Vi al doctor ir en dirección al despacho a las ${t}, no hacia el baño como dijo. Tardó más de un cuarto de hora.`,
    t => `A las ${t} el doctor no estaba en el salón. Cuando regresé diez minutos después, apareció desde el fondo del pasillo, alterado.`,
  ],
  clara: [
    t => `Clara salió de la cocina a las ${t} con la bandeja. Tardó casi veinte minutos. Eso no es lo habitual para subir una botella.`,
    t => `Vi a Clara cruzar hacia la entrada de servicio a las ${t}. Iba con la botella del señor en las manos.`,
    t => `Clara no estuvo en la cocina toda la noche. Se ausentó alrededor de las ${t} y tardó bastante en volver.`,
  ],
  thomas: [
    t => `Thomas entró al interior de la mansión a las ${t}. Lo vi en el pasillo él mismo. No solo en el jardín, como dice.`,
    t => `Thomas entró a la cocina a las ${t}. Estuvo solo allí varios minutos, junto al mueble donde estaba la bandeja del señor.`,
    t => `A las ${t} vi a Thomas salir por la puerta interior. El cobertizo del jardín tiene salida propia; no tenía razón para entrar.`,
  ],
}

// False alibi claims (what the culprit says as statement 2)
const CULPRIT_ALIBI: Record<SuspectId, string[]> = {
  victor:  ['Estuve revisando las instalaciones y la bodega alrededor de las diez. Es mi rutina antes de cerrar la mansión por la noche.', 'Estuve en la zona de servicio toda la noche. Tengo trabajo suficiente para no ir a ningún otro sitio.'],
  isabela: ['Estuve en mi habitación leyendo desde las nueve hasta medianoche. Solo bajé un momento a buscar agua.', 'Estuve en el jardín tomando el aire toda la tarde y la noche. Hay testigos que pueden confirmarlo.'],
  vidal:   ['Estuve en el salón toda la velada. Nunca me moví de ese sillón.', 'Solo salí un momento al baño. Dos o tres minutos, no más.'],
  clara:   ['Estuve en la cocina toda la noche sin salir. Tenía faena suficiente para no ir a ningún lado.', 'Yo no toqué la botella especial del señor esta noche. Eso no era responsabilidad mía.'],
  thomas:  ['Solo estuve en el jardín a recoger mis cosas. Me fui antes de las diez sin entrar a la mansión en ningún momento.', 'Terminé mis cosas y salí por la puerta del jardín directamente a la calle. No crucé por dentro.'],
}

// Culprit deflections (statement 3)
const CULPRIT_DEFLECT: Record<SuspectId, string[]> = {
  victor:  ['Deberían fijarse en Thomas Reed. Estaba en la propiedad sin autorización real. ¿Qué hace un ex-empleado despedido rondando la mansión?', 'El doctor Vidal tuvo una discusión acalorada con el señor esa tarde. Eso es lo que deberían investigar.', 'La señorita Isabela tiene deudas enormes. Las deudas llevan a acciones desesperadas, ¿no es así?'],
  isabela: ['Deberían fijarse en el doctor Vidal. Tuvo una discusión muy seria con mi tío esa tarde.', 'Y Víctor sabía que iba a ser despedido. Veinte años de servicio y de repente nada. Eso deja cicatrices profundas.', 'Thomas lleva días rondando la propiedad. Nunca se ha ido del todo desde que le despidieron.'],
  vidal:   ['El señor tenía tensiones con varias personas cercanas. Quizás deberían mirar más hacia el personal de la casa.', 'Víctor llevaba semanas con un comportamiento muy extraño. Nervioso, evasivo. Algo le preocupaba seriamente.', 'Thomas Reed vino esta noche con el pretexto de sus herramientas. Deberían averiguar cuánto tiempo estuvo aquí exactamente.'],
  clara:   ['Si buscan al culpable, fíjense en Thomas Reed. Estaba aquí sin ninguna razón legítima siendo ex-empleado.', 'La señorita Isabela tiene problemas económicos graves. Eso cambia a las personas.', 'El doctor Vidal tiene acceso a sustancias que ninguno de nosotros tendría. Es el que más sabe de venenos.'],
  thomas:  ['Lord Blackwood tenía muchos enemigos entre la gente cercana. Alguien con acceso continuo hizo esto.', 'La señorita Isabela tiene deudas muy serias. Eso lo saben hasta los del pueblo.', 'El mayordomo se va a quedar sin trabajo. Veinte años de su vida, y de repente nada. Eso cambia a una persona.'],
}

// Initial reactions (statement 1, all suspects)
const REACTIONS: Record<SuspectId, string[]> = {
  victor:  ['Llevo veinte años al servicio de Lord Blackwood. Lo que ha ocurrido es devastador para toda la mansión. Haré lo que esté en mi mano.', 'Es un shock terrible. He dedicado mi vida a esta casa. Quiero que el responsable pague por esto.'],
  isabela: ['Mi tío era un hombre difícil, pero lo quería a su manera. Esto es un golpe terrible.', 'No puedo creer lo que ha pasado. No se merecía esto.'],
  vidal:   ['Lord Blackwood me llamó esta tarde por una cuestión médica privada. Lo que ha ocurrido es horroroso.', 'Llevo atendiendo a esta familia diez años. Esto es un golpe muy duro.'],
  clara:   ['Preparé la cena del señor como cada noche. Esto es un horror. Espero que encuentren al culpable.', 'Llevo tres años en esta casa. Nunca imaginé que algo así pudiera ocurrir aquí.'],
  thomas:  ['Vine a recoger mis herramientas, nada más. Me despidieron hace tres días y no he podido volver a dormir bien.', 'No tengo nada que ver con esto. Solo vine a buscar mis cosas personales del cobertizo.'],
}

// Innocent alibis (statement 2 when not culprit)
const INNOCENT_ALIBI: Record<SuspectId, string> = {
  victor:  'Mi coartada es sólida: estuve en la cocina de las 21:30 a medianoche ayudando a Clara. Ella puede confirmarlo sin dudarlo.',
  isabela: 'Tengo testigos: estuve en el jardín casi toda la tarde. Thomas Reed puede atestiguarlo.',
  vidal:   'Puedo demostrar dónde estuve: en el salón toda la velada. Clara me trajo el té a las diez y puede confirmarlo.',
  clara:   'Yo estaba en la cocina toda la noche. Víctor estuvo conmigo y puede confirmarlo.',
  thomas:  'Me dediqué a recoger mis herramientas en el jardín. Terminé hacia las diez y me fui. Eso es todo.',
}

// Minor statements for non-key witnesses (statement 3)
const MINOR_STMT: Record<SuspectId, string[]> = {
  victor:  ['El señor tenía algo que resolver esta noche. Se le notaba la tensión desde por la tarde.', 'Toda la mansión sabía que había problemas, aunque nadie los decía en voz alta.'],
  isabela: ['Esa noche había una tensión extraña en el ambiente. Como si algo fuera a pasar.', 'Mi tío y yo teníamos una conversación pendiente, pero él nunca me dio la oportunidad.'],
  vidal:   ['Lord Blackwood tenía más problemas de los que aparentaba. No era la primera vez que alguien llegaba a su despacho con malas noticias.', 'Hay personas en esta mansión que tenían más motivos que yo para desear que las cosas cambiaran.'],
  clara:   ['Preparé todo con el mismo cuidado de siempre. Si alguien manipuló algo, no fue en mi cocina ni con mi conocimiento.', 'Cada noche hay movimiento en esta mansión. Uno aprende a no preguntar demasiado.'],
  thomas:  ['Esta mansión guarda más secretos de los que parece. Después de tres años cuidando el jardín, uno aprende a observar.', 'No era la primera vez que había tensión en esta casa. El señor no era fácil de tratar.'],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generateGame(): GeneratedGame {
  const ALL: SuspectId[] = ['victor', 'isabela', 'vidal', 'clara', 'thomas']
  const culprit = pick(ALL)
  const innocents = shuffle(ALL.filter(s => s !== culprit))
  const [w1, w2, ...bystanders] = innocents

  const motive = pick(MOTIVES.filter(m => m.culprit === culprit))
  const means  = pick(MEANS.filter(m => m.culprit === culprit))
  const alibiClaim = pick(CULPRIT_ALIBI[culprit])
  const time = pick(['22:05', '22:10', '22:15', '22:20', '22:25', '22:30'])

  const opText    = pick(OPPORTUNITY[culprit])(time)
  const breakText = pick(ALIBI_BREAK[culprit])(time)

  // ── Statements ──────────────────────────────────────────────────────────────
  const statements: Record<SuspectId, Array<{ text: string; clue?: ClueId }>> = {} as never

  statements[culprit] = [
    { text: pick(REACTIONS[culprit]) },
    { text: alibiClaim },
    { text: pick(CULPRIT_DEFLECT[culprit]) },
  ]
  for (const s of innocents) {
    const st3text = s === w1 ? opText : s === w2 ? breakText : pick(MINOR_STMT[s])
    const st3clue: ClueId | undefined = s === w1 ? 'testimonio_a' : s === w2 ? 'coartada_falsa' : undefined
    statements[s] = [
      { text: pick(REACTIONS[s]) },
      { text: INNOCENT_ALIBI[s] },
      { text: st3text, clue: st3clue },
    ]
  }

  // ── Clues ───────────────────────────────────────────────────────────────────
  const clues: Record<ClueId, { name: string; desc: string }> = {
    veneno_copa:      { name: 'Veneno en la copa',      desc: 'Residuo de veneno de dedalera en la copa del crimen. La víctima bebió de esta copa.' },
    veneno_botella:   { name: 'Veneno en la botella',   desc: 'La botella del despacho contiene el mismo veneno. El crimen se preparó aquí.' },
    diario_motivo:    { name: motive.clueLabel,          desc: motive.clueDesc },
    doc_quemado:      { name: 'Documento destruido',    desc: `Alguien quemó un documento clave. Fragmento legible: "${motive.chimenea}"` },
    doc_formal:       { name: 'Documento oficial',      desc: motive.carta },
    evidencia_medios: { name: means.clueLabel,           desc: means.clueDesc },
    testimonio_a:     { name: `Testimonio de ${SUSPECT_NAMES[w1]}`, desc: opText },
    coartada_falsa:   { name: `Coartada de ${SUSPECT_NAMES[culprit]} desmentida`, desc: breakText },
    dato_acceso:      { name: 'Registro de visitas',    desc: 'Thomas Reed firmó la entrada a las 21:45. Sin hora de salida anotada.' },
  }

  // ── Locations ───────────────────────────────────────────────────────────────
  const lids: LocationId[] = ['entrada', 'biblioteca', 'salon', 'cocina', 'jardin', 'despacho', 'habitacion']
  const locations = {} as Record<LocationId, GeneratedLocation>

  // Base fixed objects
  const baseObjects: Partial<Record<LocationId, Record<string, GeneratedObject>>> = {
    entrada:    { escalera: { name: 'Escalera principal', desc: 'Una escalera de madera noble. Nada relevante.' },
                  registro: { name: 'Registro de visitas', desc: 'Thomas Reed firmó a las 21:45. Sin hora de salida.', clue: 'dato_acceso' } },
    biblioteca: { copa:    { name: 'Copa de cristal', desc: 'Residuo oscuro en el fondo. Veneno de dedalera, de acción lenta.', clue: 'veneno_copa' },
                  cuerpo:  { name: 'Cuerpo de Lord Blackwood', desc: 'Sin signos de lucha. Envenenamiento en bebida.' },
                  diario:  { name: 'Diario de Lord Blackwood', desc: `Última entrada: "${motive.diary}"`, clue: 'diario_motivo' } },
    salon:      { chimenea: { name: 'Chimenea', desc: `Restos de papel quemado. Fragmento legible: "${motive.chimenea}". Alguien intentó destruirlo.`, clue: 'doc_quemado' },
                  retrato:  { name: 'Retrato familiar', desc: 'Lord Blackwood con su familia. Nada destacable.' } },
    cocina:     { copas: { name: 'Rack de copas', desc: 'El juego completo debería tener trece. Cuentas doce. Una fue retirada recientemente.' } },
    jardin:     { banco: { name: 'Banco de piedra', desc: 'Desde aquí se domina perfectamente toda la fachada trasera. Nadie podría moverse sin ser visto.' } },
    despacho:   { botella_despacho: { name: 'Botella del despacho', desc: 'Al olerla percibes el mismo aroma amargo que en la copa del crimen. El veneno se introdujo aquí.', clue: 'veneno_botella' },
                  escritorio:        { name: 'Escritorio del despacho', desc: 'Facturas y correspondencia ordinaria.' },
                  carta:             { name: 'Carta sobre el escritorio', desc: motive.carta, clue: 'doc_formal' } },
    habitacion: { escritorio_isa: { name: 'Escritorio de Isabela', desc: 'Sobres de entidades financieras. Deudas de juego acumuladas. Nada relacionado con el crimen de esta noche.' } },
  }

  // Inject means evidence into the correct location
  const meansObj: GeneratedObject = { name: means.objectName, desc: means.objDesc, clue: 'evidencia_medios' }
  if (!baseObjects[means.location]) baseObjects[means.location] = {}
  baseObjects[means.location]![means.objectKey] = meansObj

  for (const lid of lids) {
    locations[lid] = {
      name: LOCATION_NAMES[lid],
      desc: LOC_DESC[lid],
      exits: LOCATION_EXITS[lid],
      objects: baseObjects[lid] ?? {},
      suspects: LOCATION_SUSPECTS[lid],
    }
  }

  // ── Resolution ──────────────────────────────────────────────────────────────
  const resolution = `${SUSPECT_NAMES[culprit]}: ${motive.resolution} ${means.resolution} Añadió el veneno al vino del despacho que el señor bebería esa noche. El diario del señor, los documentos hallados y las evidencias físicas lo delataron.`

  return { culprit, locations, clues, statements, resolution }
}
