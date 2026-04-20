-- ============================================================
-- MOSAICO PRO — Seed Plan Estratégico Centro Médico Lya
-- Mayo–Julio 2026 (27 piezas + 5 packs)
-- Busca o crea automáticamente la empresa "Centro Médico Lya"
-- ============================================================

DO $$
DECLARE
  cid UUID;
BEGIN
  -- Buscar empresa existente
  SELECT id INTO cid FROM public.companies WHERE name ILIKE '%lya%' LIMIT 1;

  -- Si no existe, crearla
  IF cid IS NULL THEN
    INSERT INTO public.companies (name, slug, industry)
    VALUES ('Centro Médico Lya', 'centro-medico-lya', 'salud')
    RETURNING id INTO cid;
    RAISE NOTICE 'Empresa creada: %', cid;
  ELSE
    RAISE NOTICE 'Empresa encontrada: %', cid;
  END IF;

-- ──────────────────────────────────────────────────────────────
-- PILARES DE LYA
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.content_pillars (company_id, name, color, percentage, formats) VALUES
  (cid, 'Autoridad Médica',    '#C19E4D', 25, ARRAY['reel','video','carrusel','live']),
  (cid, 'Transformación Real', '#16A34A', 25, ARRAY['reel','carrusel','historia']),
  (cid, 'La Receta Secreta',   '#7C3AED', 20, ARRAY['reel','video','post']),
  (cid, 'Vida y Bienestar',    '#2563EB', 15, ARRAY['historia','post','video']),
  (cid, 'Conversión',          '#DC2626', 15, ARRAY['reel','historia','post'])
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- PACKS DE LYA
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.content_packs (company_id, name, price, real_value, savings, valid_until, items, status) VALUES
  (cid,
   'Pack Esencia Lya — Día de la Madre',
   149990, 159990, 10000,
   '2026-05-11',
   ARRAY['Limpieza Facial Gold $34.990','Radiofrecuencia Facial 4 sesiones $90.000','Masaje Relajante 45 min $35.000','Evaluación médica gratuita'],
   'activo'),
  (cid,
   'Pack Papá Lya — Día del Padre',
   75000, 130000, 55000,
   '2026-06-21',
   ARRAY['Masaje Descontracturante 45 min $40.000','Evaluación capilar completa $30.000','20% descuento en tratamiento alopecia'],
   'activo'),
  (cid,
   'Pack Trabajador Lya — Día del Trabajador',
   55000, 100000, 45000,
   '2026-05-02',
   ARRAY['Masaje Descontracturante 45 min $40.000','Evaluación médica presencial $60.000'],
   'activo'),
  (cid,
   'Pack Vacaciones Invierno Lya — Julio',
   179000, 339990, 160990,
   '2026-07-25',
   ARRAY['Limpieza Facial Premium $39.990','Radiofrecuencia Facial 4 sesiones $90.000','Consulta Medicina General $210.000'],
   'activo'),
  (cid,
   'Pack Receta Secreta — Permanente (solo WhatsApp)',
   210000, NULL, NULL,
   NULL,
   ARRAY['Protocolo exclusivo Lya (componentes confidenciales)','Disponible solo previa consulta por WhatsApp','Lista de espera disponible'],
   'activo')
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- PIEZAS — MAYO 2026
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.content_calendar
  (company_id, title, hook, description, cta, publish_date, publish_time, format, pillar, funnel_stage, platform, priority_service, status, board_x, board_y, board_order)
VALUES

-- Semana 1
(cid,
 'Ya no somos solo estética. Somos Centro Médico Lya',
 'Lo que estás a punto de ver cambia todo lo que sabías sobre Clínica Lya.',
 'Reel de transición de marca. La Dra. Leidy habla a cámara. Presenta las nuevas especialidades y la visión del centro médico integral.',
 'Agenda tu primera consulta',
 '2026-04-28', '09:00', 'reel', 'autoridad', 'tofu', 'instagram',
 'Lanzamiento Centro Médico', 'borrador', 40, 40, 1),

(cid,
 'El cuerpo que más trabaja también merece descanso',
 'Tu cuerpo trabajó todo el mes. ¿Lo has cuidado al menos una vez?',
 'Contenido para el segmento trabajadores. Muestra el agotamiento físico de una jornada laboral. Masajes descontracturantes, kinesiología, sueroterapia. Oferta: Pack Trabajador = Masaje + Evaluación médica $55.000.',
 'Escríbenos al WhatsApp ahora',
 '2026-04-30', '12:00', 'reel', 'conversion', 'bofu', 'instagram',
 'Pack Trabajador Lya', 'borrador', 260, 40, 2),

(cid,
 'Promoción Pack Trabajador Lya — Solo hoy',
 'Pack Masaje + Evaluación médica $55.000 (ahorro $45.000). Solo durante el feriado.',
 'Post de oferta con precio visible. Pack: Masaje descontracturante + Evaluación médica $55.000 (ahorro $45.000). Urgencia: "Solo durante el feriado".',
 'Escríbenos YA al WhatsApp — cupos limitados',
 '2026-05-01', '09:00', 'post', 'conversion', 'bofu', 'instagram',
 'Pack Trabajador Lya', 'borrador', 480, 40, 3),

-- Semana 2
(cid,
 '¿Sabías que la caída de cabello tiene tratamiento médico real?',
 'Si tu cabello cae más de lo normal, tu cuerpo te está avisando algo.',
 'Reel educativo sobre alopecia. Causa, mitos, solución real. Sin mencionar precio aún. Objetivo: educar y generar consultas.',
 'Escríbenos para una evaluación capilar gratuita',
 '2026-05-05', '09:00', 'reel', 'autoridad', 'tofu', 'instagram',
 'Tratamiento Alopecia', 'borrador', 40, 200, 4),

(cid,
 'Testimonio: "Lo que el regalo de mamá debería ser este año"',
 'Inicio de campaña Día de la Madre. Testimonio real de paciente.',
 'Testimonio de paciente + revelación del pack especial de regalo. Construir urgencia antes del fin de semana.',
 'Reserva el pack de mamá antes del domingo',
 '2026-05-07', '12:00', 'carrusel', 'transformacion', 'mofu', 'instagram',
 'Pack Esencia Lya', 'borrador', 260, 200, 5),

(cid,
 'Pack Día de la Madre Lya — Precio visible, fecha límite',
 'El mejor regalo de mamá no se compra en una tienda.',
 'Reveal del pack especial con precio y lista de tratamientos. Urgencia: "Solo hasta el domingo 11 de mayo". WhatsApp CTA.',
 'Reserva ahora — solo hasta el domingo 11 de mayo',
 '2026-05-09', '18:00', 'reel', 'conversion', 'bofu', 'instagram',
 'Pack Esencia Lya', 'borrador', 480, 200, 6),

(cid,
 'Feliz Día de la Madre + Última hora para el pack',
 'Para todas las mamás que nos confían su bienestar, gracias.',
 'Story + post con contenido emocional. Último recordatorio de urgencia. Agradecimiento a las madres pacientes con foto grupal o collage.',
 'Última hora — escríbenos ahora',
 '2026-05-11', '10:00', 'post', 'conversion', 'bofu', 'instagram',
 'Pack Esencia Lya', 'borrador', 700, 200, 7),

-- Semana 3
(cid,
 '"Tenemos un protocolo que no existe en ninguna otra clínica de la VI Región"',
 'Llevo años atendiendo pacientes. Este es el resultado que más orgullo me da... y no puedo contarte cómo lo logramos.',
 'Primer episodio de la serie La Receta Secreta Lya. Misterio total. La Dra. insinúa resultados extraordinarios sin revelar el protocolo. Genera curiosidad y DMs.',
 'Escríbenos al WhatsApp si quieres saber más',
 '2026-05-12', '09:00', 'reel', 'receta_secreta', 'mofu', 'instagram',
 'La Receta Secreta Lya', 'borrador', 40, 360, 8),

(cid,
 'Podcast Lya Contigo EP.1: "Medicina general + estética: por qué van juntas"',
 'Primera vez que la Dra. habla de la visión completa de Lya.',
 'Primera grabación del podcast. La Dra. como conductora. Formato 20-30 min. Reel resumen de 60 seg publicado el mismo día.',
 'Escucha el episodio completo en nuestro perfil',
 '2026-05-15', '20:00', 'video', 'autoridad', 'tofu', 'instagram',
 'Podcast Lya Contigo', 'borrador', 260, 360, 9),

-- Semana 4
(cid,
 'Perfil del mes: La Kinesióloga de Lya',
 '¿Sabes quién cuida tu cuerpo cuando tienes dolor?',
 'Video corto de presentación de la kinesióloga. Quién es, qué trata, cómo agendar. Humaniza el equipo y amplía la base de pacientes.',
 'Agenda tu primera sesión con ella',
 '2026-05-19', '09:00', 'video', 'bienestar', 'tofu', 'instagram',
 'Kinesiología', 'borrador', 480, 360, 10),

(cid,
 'Cierre de mayo: "Agenda tu hora antes de que termine el mes"',
 'Mayo termina. Las horas de esta semana tienen prioridad de agenda para junio.',
 'CTA directo. Recordatorio de servicios disponibles. Urgencia: "Mayo termina. Las horas de esta semana tienen prioridad de agenda para junio."',
 'Escríbenos ahora — agenda tu hora',
 '2026-05-23', '18:00', 'post', 'conversion', 'bofu', 'instagram',
 'Agendamiento general', 'borrador', 700, 360, 11),

-- ──────────────────────────────────────────────────────────────
-- PIEZAS — JUNIO 2026
-- ──────────────────────────────────────────────────────────────

-- Semana 1
(cid,
 '"3 señales de que tu cuerpo necesita kinesiología ahora mismo"',
 'Si te despiertas con dolor todos los días, tu cuerpo no está siendo dramático. Está pidiendo ayuda.',
 'Reel educativo de alto TOFU. Hook de síntomas cotidianos: dolor de cuello, rigidez matinal, dolor de espalda baja. Solución: kinesiología en Lya.',
 'Agenda tu evaluación postural gratuita',
 '2026-06-02', '09:00', 'reel', 'autoridad', 'tofu', 'instagram',
 'Kinesiología', 'borrador', 40, 520, 12),

(cid,
 'Oferta especial 48 horas: Primera consulta kinesiología $49.000',
 'Solo hoy y mañana. 10 cupos disponibles.',
 'Promo exclusiva: Primera consulta + evaluación postural incluida $49.000 (regular $70.000). Solo 6 y 7 de junio. Máximo 10 cupos. CTA WhatsApp urgente.',
 'Escríbenos AHORA — solo quedan 10 cupos',
 '2026-06-06', '18:00', 'post', 'conversion', 'bofu', 'instagram',
 'Kinesiología', 'borrador', 260, 520, 13),

-- Semana 2
(cid,
 '"El invierno también afecta tu cabello. ¿Lo sabías?"',
 'El frío no solo te enfría por fuera. También afecta tu cuero cabelludo.',
 'Educación sobre caída de cabello en invierno. Conecta la estación con el problema de alopecia para hacerlo más relevante. Presenta el tratamiento de Lya como la solución.',
 'Pide tu evaluación capilar gratuita',
 '2026-06-09', '09:00', 'reel', 'autoridad', 'tofu', 'instagram',
 'Tratamiento Alopecia', 'borrador', 480, 520, 14),

(cid,
 'La Receta Secreta Lya — Episodio 2: "El resultado habla solo"',
 'Tres semanas después. El cambio que nadie esperaba.',
 'Antes/después potente de paciente que usó el protocolo. Sin revelar qué es. Solo el resultado. Texto: "¿Quieres saber cómo lo logramos? Escríbenos." Máximo misterio.',
 '¿Quieres saber cómo lo logramos? Escríbenos',
 '2026-06-11', '12:00', 'reel', 'receta_secreta', 'mofu', 'instagram',
 'La Receta Secreta Lya', 'borrador', 700, 520, 15),

-- Semana 3
(cid,
 'Pre-campaña Día del Padre: "¿Qué le regalas al papá que lo tiene todo?"',
 'El regalo que más necesita no está en ninguna tienda.',
 'Inicio de la campaña. Segmento mixto: hombres que quieren regalarse algo + mujeres/hijos que buscan regalo. Teaser del pack especial.',
 'Descubre el pack especial para papá',
 '2026-06-16', '09:00', 'post', 'conversion', 'mofu', 'instagram',
 'Pack Papá Lya', 'borrador', 40, 680, 16),

(cid,
 'Podcast EP.5: "Hombres y salud: lo que nadie habla"',
 'Hoy vamos a hablar de lo que los hombres nunca dicen sobre su salud.',
 'Episodio especial pre Día del Padre. Alopecia, salud masculina, tratamientos estéticos para hombres sin tabú. Posicionamiento: Lya atiende a hombres con la misma seriedad médica.',
 'Escucha el episodio y compártelo con los papás de tu vida',
 '2026-06-19', '20:00', 'video', 'autoridad', 'tofu', 'instagram',
 'Podcast Lya Contigo', 'borrador', 260, 680, 17),

(cid,
 'Pack Día del Padre Lya — $75.000 | Solo hasta el 21 de junio',
 'Papá siempre cuida a todos. ¿Cuándo fue la última vez que alguien lo cuidó a él?',
 'Pack Papá Lya: Masaje descontracturante + Evaluación capilar gratuita + 20% descuento en tratamiento alopecia. CTA WhatsApp urgente.',
 'Regálale el pack a papá — solo hasta el 21 de junio',
 '2026-06-20', '18:00', 'post', 'conversion', 'bofu', 'instagram',
 'Pack Papá Lya', 'borrador', 480, 680, 18),

-- Semana 4
(cid,
 '"Por qué elegir un centro médico y no solo una clínica estética"',
 'No es lo mismo. Y hoy te voy a explicar la diferencia.',
 'Contenido de autoridad y diferenciación. La Dra. explica la diferencia entre un centro médico integral y una clínica estética. Posicionamiento para la VI Región.',
 'Agenda tu primera consulta médica con nosotros',
 '2026-06-23', '09:00', 'reel', 'autoridad', 'tofu', 'instagram',
 'Centro Médico Integral', 'borrador', 700, 680, 19),

-- ──────────────────────────────────────────────────────────────
-- PIEZAS — JULIO 2026
-- ──────────────────────────────────────────────────────────────

-- Semana 1
(cid,
 'Celebración Día del Médico — Historia de la Dra. Leidy Boscán',
 'Nadie me pregunta por qué elegí ser médico. Hoy se los voy a contar.',
 'Contenido emotivo y de autoridad. La Dra. comparte su historia, por qué eligió la medicina, su visión del centro médico. Alto potencial viral. Humaniza la marca.',
 'Gracias a todos nuestros pacientes por confiar en Lya',
 '2026-07-03', '09:00', 'video', 'autoridad', 'tofu', 'instagram',
 'Branding personal Dra. Leidy', 'borrador', 40, 840, 20),

(cid,
 'Promo Día del Médico: "Consulta médica general $99.000 esta semana"',
 'Esta semana, medicina general con precio especial.',
 'Precio especial en consulta de medicina general solo durante la primera semana de julio. Objetivo: atraer nuevos pacientes al centro médico.',
 'Agenda tu consulta esta semana — precio especial',
 '2026-07-04', '18:00', 'post', 'conversion', 'bofu', 'instagram',
 'Medicina General', 'borrador', 260, 840, 21),

-- Semana 2
(cid,
 '"5 hábitos de alimentación que te están haciendo daño sin que lo sepas"',
 'Estás comiendo todos los días. Pero, ¿estás comiendo bien?',
 'Reel educativo de nutrición. Alto potencial TOFU. Conecta con consulta de nutricionista en Lya. Precio visible al final: Primera consulta $210.000.',
 'Agenda tu primera consulta con nuestra nutricionista',
 '2026-07-07', '09:00', 'reel', 'bienestar', 'tofu', 'instagram',
 'Nutrición', 'borrador', 480, 840, 22),

(cid,
 'La Receta Secreta Lya — Episodio 3: "Te damos una pista"',
 'Tres meses llevamos mostrando resultados. Hoy les damos la primera pista.',
 'Tercer episodio de la serie. Se da una pista vaga del protocolo sin revelarlo. Aumenta la intriga acumulada. "Quienes ya la tienen dicen que no volverían a vivir sin ella."',
 'Si quieres ser de los primeros en saberlo todo, escríbenos',
 '2026-07-09', '12:00', 'reel', 'receta_secreta', 'mofu', 'instagram',
 'La Receta Secreta Lya', 'borrador', 700, 840, 23),

-- Semana 3
(cid,
 '"Las vacaciones son el mejor momento para ese tratamiento que siempre postergaste"',
 'Tienes tiempo. Tu cuerpo te lo está pidiendo. ¿Qué esperas?',
 'Contenido para personas con tiempo libre durante las vacaciones. Lista los tratamientos con períodos de recuperación cortos.',
 'Reserva tu tratamiento vacacional ahora',
 '2026-07-14', '09:00', 'post', 'transformacion', 'mofu', 'instagram',
 'Tratamientos en general', 'borrador', 40, 1000, 24),

(cid,
 'Pack Vacaciones Lya — $179.000 | Solo 2 semanas',
 'El verano llega. Tu piel también merece prepararse.',
 'Pack Vacaciones: Limpieza Facial Premium + Radiofrecuencia Facial 4 sesiones + Consulta médica general. Valor real $339.990. Ahorro $160.990.',
 'Reserva tu Pack Vacaciones — solo 2 semanas disponibles',
 '2026-07-18', '18:00', 'post', 'conversion', 'bofu', 'instagram',
 'Pack Vacaciones Lya', 'borrador', 260, 1000, 25),

-- Semana 4
(cid,
 'Podcast EP.9: "Salud mental en invierno — cómo cuidar tu mente cuando el frío pesa"',
 'El invierno afecta más que tu cuerpo. También afecta tu mente.',
 'Episodio especial con la psicóloga del centro. Tema: salud mental en invierno, tristeza estacional, ansiedad. Posiciona al centro en psicología.',
 'Escucha el episodio y compártelo con quien lo necesite',
 '2026-07-21', '09:00', 'video', 'bienestar', 'tofu', 'instagram',
 'Psicología', 'borrador', 480, 1000, 26),

(cid,
 'Preview agosto: "El mes de la Estética Lya se acerca"',
 'Algo grande viene en agosto. Síguenos para ser los primeros en enterarse.',
 'Teaser del mes de agosto. Genera expectativa. "Algo grande viene en agosto. Síguenos para ser los primeros en enterarse."',
 'Síguenos y activa las notificaciones',
 '2026-07-25', '18:00', 'post', 'autoridad', 'tofu', 'instagram',
 'Anticipación agosto', 'borrador', 700, 1000, 27);

END $$;
