 
  import nodemailer from 'nodemailer';  // Cambiar require por import  //PARA EL GMAIL

  import express from 'express';
  import mysql from 'mysql2';
  import bcrypt from 'bcryptjs';
  import cors from 'cors';
  import multer from 'multer';
  import path from 'path';
  import fs from 'fs';
  import jwt from 'jsonwebtoken';
 
  import bodyParser from 'body-parser';  //PARA EL GMAIL

  import dotenv from 'dotenv';
  dotenv.config(); // Carga las variables de entorno desde el archivo .env







  // Obtener la ruta del directorio actual (corregido para Windows)
  const __dirname = path.resolve();

  const app = express();
  const port= process.env.PORT || 8080;

    // Configura CORS para permitir solicitudes solo desde tu frontend
  const corsOptions = {
    origin: 'https://gestioncalidaduncp-production.up.railway.app', // Permitir solo solicitudes desde este dominio
    methods: 'GET, POST, PUT, DELETE', // Métodos permitidos
    allowedHeaders: 'Content-Type, Authorization', // Encabezados permitidos
  };

  // Aplica la configuración de CORS
  app.use(cors(corsOptions));


  

  app.use(express.json());
 //PARA ENVIAR GMAIL
  // Usamos body-parser para obtener los datos del cuerpo de la solicitud
  app.use(bodyParser.json());


  // Verificar si la carpeta 'uploads' existe, si no, crearla
  const uploadDirectory = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, { recursive: true });
  }

  // Configuración de almacenamiento de archivos con multer
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDirectory);
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + path.extname(file.originalname)); // Usar la fecha para garantizar nombres únicos
    }
  });

  const upload = multer({
    storage: storage,
    limits: {
      fileSize: 10 * 1024 * 1024, // Limitar el tamaño a 10MB por archivo
    },
  });

  // Servir archivos estáticos desde la carpeta 'uploads'
  app.use('/uploads', express.static(uploadDirectory));

  // Configuración de la base de datos
  // Configuración del pool de conexiones
  const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    connectionLimit: 10,  // Número de conexiones simultáneas que el pool puede manejar
    waitForConnections: true,  // Espera cuando no haya conexiones disponibles
    queueLimit: 0  // No limitar el número de consultas que esperan en la cola
  });


  db.getConnection((err, connection) => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err.stack);
        return;
    }
    console.log('Conexión a la base de datos exitosa');
    cifrarContraseñas();  // Llamar a la función para cifrar contraseñas si es necesario

    // Libera la conexión cuando termines
    connection.release();
  });

  // Función para generar el token
  const generateToken = (user) => {
    const payload = { correo: user.correo, rol: user.rol };
    return jwt.sign(payload, 'secreta', { expiresIn: '1h' });
    
  };

  db.on('error', (err) => {
    console.error('Error en el pool de conexiones:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      // Reconectar si la conexión se pierde
      db.getConnection((err, connection) => {
        if (err) {
          console.error('Error al reconectar:', err);
        } else {
          console.log('Reconexión exitosa');
          connection.release();
        }
      });
    }
  });

  ////CONEXION

  //LOGIN---------------------------------------------------------------------------------------------

  app.post('/login', (req, res) => {
    const { correo, password } = req.body;

    if (!correo || !password) {
        return res.status(400).json({ message: 'Correo y contraseña son requeridos' });
    }

    // Verifica el usuario en la tabla usuarios
    db.query('SELECT * FROM usuarios WHERE correo = ?', [correo], (err, result) => {
        if (err) {
            console.error('Error al consultar el usuario:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }

        if (result.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const user = result[0];

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                console.error('Error al comparar las contraseñas:', err);
                return res.status(500).json({ message: 'Error en el servidor' });
            }

            if (!isMatch) {
                return res.status(400).json({ message: 'Contraseña incorrecta' });
            }

            // Inicializa las variables de ID
            let id_estudiante = null;
            let id_asesor = null;
            let id_revisor = null;

            // Manejo según rol
            if (user.rol === 'revisor') {
                db.query('SELECT id FROM revisores WHERE correo = ?', [user.correo], (err, revisorResult) => {
                    if (err) {
                        console.error('Error al consultar el revisor:', err);
                        return res.status(500).json({ message: 'Error en el servidor' });
                    }

                    id_revisor = revisorResult.length > 0 ? revisorResult[0].id : null;

                    // Generamos el token y enviamos la respuesta
                    const token = generateToken(user);
                    res.status(200).json({
                        message: 'Login exitoso',
                        token,
                        usuario: {
                            correo: user.correo,
                            rol: user.rol,
                            id_estudiante: null,
                            id_asesor: null,
                            id_revisor: id_revisor
                        }
                    });
                });
            } else if (user.rol === 'asesor') {
                db.query('SELECT id FROM asesores WHERE correo = ?', [user.correo], (err, asesorResult) => {
                    if (err) {
                        console.error('Error al consultar el asesor:', err);
                        return res.status(500).json({ message: 'Error en el servidor' });
                    }

                    id_asesor = asesorResult.length > 0 ? asesorResult[0].id : null;

                    // Ahora buscamos el id del estudiante
                    db.query('SELECT id FROM estudiantes WHERE correo = ?', [user.correo], (err, studentResult) => {
                        if (err) {
                            console.error('Error al consultar el estudiante:', err);
                            return res.status(500).json({ message: 'Error en el servidor' });
                        }

                        id_estudiante = studentResult.length > 0 ? studentResult[0].id : null;

                        // Generamos el token y enviamos la respuesta
                        const token = generateToken(user);
                        res.status(200).json({
                            message: 'Login exitoso',
                            token,
                            usuario: {
                                correo: user.correo,
                                rol: user.rol,
                                id_estudiante: id_estudiante,
                                id_asesor: id_asesor,
                                id_revisor: null
                            }
                        });
                    });
                });
            } else {
                // Si no es ni revisor ni asesor, solo obtenemos el id del estudiante
                db.query('SELECT id FROM estudiantes WHERE correo = ?', [user.correo], (err, studentResult) => {
                    if (err) {
                        console.error('Error al consultar el estudiante:', err);
                        return res.status(500).json({ message: 'Error en el servidor' });
                    }

                    id_estudiante = studentResult.length > 0 ? studentResult[0].id : null;

                    const token = generateToken(user);
                    res.status(200).json({
                        message: 'Login exitoso',
                        token,
                        usuario: {
                            correo: user.correo,
                            rol: user.rol,
                            id_estudiante: id_estudiante,
                            id_asesor: null,
                            id_revisor: null
                        }
                    });
                });
            }
        });
    });
  });
  

  // Ruta para registrar un usuario (con contraseña cifrada)
  app.post('/register', (req, res) => {
    const { correo, password, rol } = req.body;

    if (!correo || !password || !rol) {
      return res.status(400).json({ message: 'Correo, contraseña y rol son requeridos' });
    }

    // Cifrar la contraseña
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error('Error al cifrar la contraseña:', err);
        return res.status(500).json({ message: 'Error en el servidor' });
      }

      // Insertar el nuevo usuario con la contraseña cifrada
      db.query('INSERT INTO usuarios (correo, password, rol) VALUES (?, ?, ?)', 
      [correo, hashedPassword, rol], (err, result) => {
        if (err) {
          console.error('Error al guardar el usuario:', err);
          return res.status(500).json({ message: 'Error al guardar el usuario' });
        }
        res.status(201).json({ message: 'Usuario registrado exitosamente' });
      });
    });
  });


  ////PROCESO 3-----------------------------------------------------------------------------------------------------
  // Ruta para obtener las prácticas
  // API para obtener inscripciones
// API para obtener inscripciones
  app.get('/api/inscripciones', (req, res) => {
    const query = `
      SELECT p.*, e.correo
      FROM inscripciones_emisiones p
      JOIN estudiantes e ON p.id_estudiante = e.id
      ORDER BY p.fecha_creacion DESC;
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error('Error al ejecutar la consulta:', err);
            res.status(500).send('Error al obtener los datos de las prácticas');
            return;
        }
        
        res.json(result);
    });
  });


  // API para insertar inscripciones
  app.post('/api/inscripcion_emision', upload.fields([
    { name: 'solicitud', maxCount: 1 },
    { name: 'ficha', maxCount: 1 }, // Cambié planPracticas a ficha
    { name: 'informe', maxCount: 1 } // Agregué este campo para el informe final
  ]), (req, res) => {
    const { id_estudiante, comentarios } = req.body;

    if (!id_estudiante) {
        return res.status(400).json({ message: 'El ID del estudiante es requerido' });
    }

    if (!req.files || !req.files.solicitud || !req.files.ficha || !req.files.informe) {
        return res.status(400).json({ message: 'Todos los archivos son necesarios' });
    }

    // Solo almacena los nombres de los archivos, no las rutas absolutas
    const solicitud = req.files.solicitud[0].filename;
    const ficha_revision = req.files.ficha[0].filename; // Asegúrate de tener este archivo
    const informe_final = req.files.informe[0].filename; // Asegúrate de tener este archivo

    const estadoFinal = 'Pendiente'; // O cualquier lógica que necesites

    db.query('INSERT INTO inscripciones_emisiones (id_estudiante, solicitud_inscripcion_emision, ficha_revision, informe_final, estado_proceso, comentarios) VALUES (?, ?, ?, ?, ?, ?)', 
      [id_estudiante, solicitud, ficha_revision, informe_final, estadoFinal, comentarios], 
      (err, result) => {
        if (err) {
            console.error('Error al guardar en la base de datos:', err);
            return res.status(500).json({ message: 'Error al guardar en la base de datos' });
        }
        res.status(200).json({ message: 'Prácticas enviadas con éxito' });
    });
  });


  // Ruta para actualizar el estado de la inscripción
  app.put('/api/actualizar_inscripcion', (req, res) => {
    const { id_inscripcion, estado, respuesta_comision } = req.body;

    if (!id_inscripcion || !estado) {
        return res.status(400).json({ message: 'El ID de la inscripción y el estado son requeridos' });
    }

    try {
        // Actualizar el estado de la inscripción en la base de datos
        db.query('UPDATE inscripciones_emisiones SET estado_proceso = ?, respuesta_comision = ? WHERE id = ?', [estado, respuesta_comision, id_inscripcion], async (err, result) => {
            if (err) {
                console.error('Error al actualizar el estado y respuesta:', err);
                return res.status(500).json({ message: 'Error al actualizar el estado o respuesta' });
            }

            // Verificar si se actualizó alguna fila
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Inscripción no encontrada' });
            }

            // Obtener el ID del estudiante asociado a la inscripción
            const [inscripcion] = await db.promise().query('SELECT id_estudiante FROM inscripciones_emisiones WHERE id = ?', [id_inscripcion]);
            const { id_estudiante } = inscripcion[0];

            // Enviar notificación al estudiante
            const mensaje = `El estado de tu inscripción ha cambiado a: ${estado}`;
            await db.promise().query('INSERT INTO notificaciones (id_estudiante, mensaje) VALUES (?, ?)', [id_estudiante, mensaje]);

            res.status(200).json({ message: 'Estado y respuesta actualizados correctamente, y notificación enviada' });
        });
    } catch (error) {
        console.error('Error al actualizar el estado y respuesta:', error);
        res.status(500).json({ message: 'Error al actualizar el estado o respuesta', error: error.message });
    }
  });



  // Endpoint para subir el certificado
  // Endpoint para subir el certificado
  app.post('/api/certificado', upload.single('certificado'), (req, res) => {
    const { id_estudiante, correo } = req.body;
    const certificadoFile = req.file;

    // Verificar si los parámetros son válidos
    if (!id_estudiante || !correo || !certificadoFile) {
        return res.status(400).json({ error: 'Faltan parámetros: id_estudiante, correo, o el archivo.' });
    }

    // Obtener el nombre del archivo subido
    const certificadoFileName = certificadoFile.filename;  // Usamos el nombre del archivo
    console.log('Certificado subido con éxito:', certificadoFileName);

    // Crear la consulta SQL para insertar el certificado en la base de datos
    const query = `
        INSERT INTO certificados_practicas (id_estudiante, correo, certificado_practicas)
        VALUES (?, ?, ?)
    `;

    // Ejecutar la consulta SQL
    db.query(query, [id_estudiante, correo, certificadoFileName], (err, results) => {
        if (err) {
            console.error('Error al insertar el certificado:', err);
            return res.status(500).json({ error: 'Error al insertar el certificado en la base de datos.', details: err.message });
        }
        console.log('Certificado insertado exitosamente:', results);

        // Enviar respuesta al cliente
        res.status(200).json({ message: 'Certificado enviado exitosamente.' });
    });
  });

  


    
  
  ///------------------------------------------------------------------------------------------------------------

  // Ruta para registrar la práctica (subir los archivos y agregar estado)
  app.post('/api/practicas', upload.fields([
    { name: 'solicitud', maxCount: 1 },
    { name: 'planPracticas', maxCount: 1 }
  ]), (req, res) => {
    const { id_estudiante, comentarios, estado_proceso } = req.body;

    if (!id_estudiante) {
      return res.status(400).json({ message: 'El ID del estudiante es requerido' });
    }

    if (!req.files || !req.files.solicitud || !req.files.planPracticas) {
      return res.status(400).json({ message: 'Ambos archivos son necesarios' });
    }

    // Solo almacena los nombres de los archivos, no las rutas absolutas
    const solicitud = req.files.solicitud[0].filename;
    const planPracticas = req.files.planPracticas[0].filename;

    let estadoFinal = 'Pendiente';

    if (estado_proceso) {
      try {
        const estado = JSON.parse(estado_proceso);
        estadoFinal = estado[Object.keys(estado)[0]] || 'Pendiente';
      } catch (err) {
        console.error('Error al parsear estado_proceso:', err);
        return res.status(400).json({ message: 'El formato de estado_proceso es inválido' });
      }
    }

    db.query('INSERT INTO practicas (id_estudiante, solicitud_inscripcion, plan_practicas, estado_proceso, comentarios) VALUES (?, ?, ?, ?, ?)', 
      [id_estudiante, solicitud, planPracticas, estadoFinal, comentarios], 
      (err, result) => {
        if (err) {
          console.error('Error al guardar en la base de datos:', err);
          return res.status(500).json({ message: 'Error al guardar en la base de datos' });
        }
        res.status(200).json({ message: 'Prácticas enviadas con éxito' });
      });
  });

  // Ruta para obtener las prácticas
  app.get('/api/practicas', (req, res) => {
    const query = `
      SELECT p.*, e.correo
      FROM practicas p
      JOIN estudiantes e ON p.id_estudiante = e.id
      ORDER BY p.fecha_creacion DESC;
    `;

    db.query(query, (err, result) => {
      if (err) {
        console.error('Error al ejecutar la consulta:', err);
        res.status(500).send('Error al obtener los datos de las prácticas');
        return;
      }
      res.json(result);
    });
  });

  // Ruta para actualizar el estado de la práctica
  app.put('/api/actualizar-estado', (req, res) => {
    const { idPractica, estado } = req.body;

    if (!idPractica || !estado) {
      return res.status(400).json({ message: 'El ID de la práctica y el estado son requeridos' });
    }

    try {
      db.query('UPDATE practicas SET estado_proceso = ? WHERE id = ?', [estado, idPractica], async (err, result) => {
        if (err) {
          console.error('Error al actualizar el estado:', err);
          return res.status(500).json({ message: 'Error al actualizar el estado' });
        }

        const [practica] = await db.promise().query('SELECT id_estudiante FROM practicas WHERE id = ?', [idPractica]);
        const { id_estudiante } = practica[0];

        const mensaje = `El estado de tu práctica ha cambiado a: ${estado}`;
        await db.promise().query('INSERT INTO notificaciones (id_estudiante, mensaje) VALUES (?, ?)', [id_estudiante, mensaje]);

        res.status(200).json({ message: 'Estado actualizado y notificación enviada' });
      });
    } catch (error) {
      res.status(500).json({ message: 'Error al actualizar el estado', error: error.message });
    }
  });

  // Ruta para obtener los comentarios de la comisión
  app.get('/api/comentarios', (req, res) => {
    const { idPractica } = req.query;

    if (!idPractica) {
      return res.status(400).json({ message: 'El ID de la práctica es requerido' });
    }

    db.query('SELECT * FROM libro_inscripcion WHERE id_practica = ?', [idPractica], (err, result) => {
      if (err) {
        console.error('Error al obtener los comentarios:', err);
        return res.status(500).json({ message: 'Error al obtener los comentarios' });
      }

      res.status(200).json(result);
    });
  });

  // Ruta para guardar los comentarios en la tabla 'practicas'
  app.post('/api/comentarios', (req, res) => {
    const { idPractica, comentario } = req.body;

    const query = `
      UPDATE practicas
      SET comentarios = ?
      WHERE id = ?
    `;

    db.query(query, [comentario, idPractica], (err, result) => {
      if (err) {
        console.error('Error al actualizar el comentario:', err);
        return res.status(500).send('Error al guardar el comentario');
      }
      res.status(200).send('Comentario guardado');
    });
  });

  // Ruta para inscribir la práctica y actualizar el estado en la tabla 'practicas'
  app.post('/api/inscribir', (req, res) => {
    const { idPractica, estado, comentarios } = req.body;

    const query = `
      UPDATE practicas
      SET estado_proceso = ?, estado_secretaria = ?, comentarios = ?
      WHERE id = ?
    `;

    db.query(query, [estado, estado, comentarios, idPractica], (err, result) => {
      if (err) {
        console.error('Error al inscribir la práctica:', err);
        return res.status(500).send('Error al inscribir la práctica');
      }

      const notificationQuery = `
        INSERT INTO notificaciones (id_estudiante, mensaje)
        VALUES (?, ?)
      `;
      db.query(notificationQuery, [idEstudiante, `Tu inscripción en la práctica ha sido ${estado}.`], (err2) => {
        if (err2) {
          console.error('Error al agregar la notificación al estudiante:', err2);
        }
      });

      res.status(200).send('Práctica inscrita y notificación enviada');
    });
  });

  // Función para cifrar todas las contraseñas de los usuarios
  const cifrarContraseñas = () => {
    db.query('SELECT * FROM usuarios WHERE password NOT LIKE "$2a$%"', (err, result) => {
      if (err) {
        console.error('Error al obtener usuarios:', err);
        return;
      }

      if (result.length === 0) {
        console.log('No se encontraron usuarios con contraseñas en texto plano');
        return;
      }

      result.forEach(user => {
        const plainPassword = user.password;

        bcrypt.hash(plainPassword, 10, (err, hashedPassword) => {
          if (err) {
            console.error('Error al cifrar la contraseña del usuario', user.id, ':', err);
            return;
          }

          db.query('UPDATE usuarios SET password = ? WHERE id = ?', [hashedPassword, user.id], (err, updateResult) => {
            if (err) {
              console.error('Error al actualizar la contraseña del usuario', user.id, ':', err);
              return;
            }

            console.log('Contraseña del usuario', user.id, 'actualizada con éxito');
          });
        });
      });
    });
  };


  // Ruta para obtener las notificaciones del estudiante
  app.get('/api/notificaciones', (req, res) => {
    const { id_estudiante } = req.query;

    if (!id_estudiante) {
      return res.status(400).json({ message: 'El ID del estudiante es requerido' });
    }

    db.query('SELECT * FROM notificaciones WHERE id_estudiante = ? ORDER BY fecha DESC', [id_estudiante], (err, result) => {
      if (err) {
        console.error('Error al obtener las notificaciones:', err);
        return res.status(500).json({ message: 'Error al obtener las notificaciones' });
      }

      res.status(200).json(result);
    });
  });

  //REVISORRRRRRRR-------------------------------------------------------------------------------------------
  app.get('/api/informesRevisados', (req, res) => {
    const { id_revisor } = req.query;

    console.log('ID Revisor recibido:', id_revisor); // Verifica si el ID está llegando correctamente

    if (!id_revisor) {
        return res.status(400).send('ID Revisor es requerido');
    }

    const query = `
    SELECT 
        informe_revisado.id AS id_informe,
        informe_revisado.id_estudiante,
        informe_revisado.id_asesor,
        informe_revisado.informe_final,
        informe_revisado.informe_final_asesoria,
        informe_revisado.estado_final_informe,
        informe_revisado.estado_final_asesoria,
        informe_revisado.id_revisor,
        informe_revisado.fecha_creacion
    FROM 
        informes_revisados informe_revisado
    INNER JOIN (
        SELECT 
            id_estudiante,
            id_asesor,
            MAX(fecha_creacion) AS ultima_fecha
        FROM 
            informes_revisados
        GROUP BY 
            id_estudiante, id_asesor
    ) AS subquery ON 
        informe_revisado.id_estudiante = subquery.id_estudiante
        AND informe_revisado.id_asesor = subquery.id_asesor
        AND informe_revisado.fecha_creacion = subquery.ultima_fecha
    WHERE 
        informe_revisado.id_revisor = ?
    ORDER BY 
        informe_revisado.fecha_creacion DESC;
    `;

    db.query(query, [id_revisor], (err, result) => {
        if (err) {
            console.error('Error al obtener los informes revisados:', err);
            return res.status(500).send('Error al obtener los informes revisados');
        }

        console.log('Resultado de la consulta:', result); // Verifica el resultado de la consulta

        if (result.length > 0) {
            return res.status(200).json(result);
        } else {
            return res.status(404).send('No se encontraron informes revisados');
        }
    });
  });




/////VISTA DE REVISORRRRRRRRRRRRR---------------------------------------------------------------------------
  

  app.put('/api/actualizarEstado', (req, res) => {
    const { id_estudiante, id_asesor, estado_final_informe, estado_final_asesoria, estado_comision } = req.body;

    // Verificamos que los datos necesarios estén presentes
    if (!estado_comision) {
      return res.status(400).send('Falta el estado de comisión');
    }

    const query = `
      UPDATE informes_revisados
      SET estado_final_informe = ?, estado_final_asesoria = ?, estado_comision = ?
      WHERE id_estudiante = ? AND id_asesor = ?
    `;

    db.query(query, [estado_final_informe, estado_final_asesoria, estado_comision, id_estudiante, id_asesor], (err, result) => {
      if (err) {
        console.error('Error al actualizar el informe:', err);
        return res.status(500).send('Error al actualizar el informe');
      }
      
      res.status(200).send('Informe actualizado correctamente');
    });
  });








  //PROCESO 2 REVISON DE INFORMES
  //ESTUDAINTE------------------------------------------------------------------------------------------

  // Ruta para obtener las notificaciones de los informes
  app.get('/api/notificaciones_informes', (req, res) => {
    const { id_estudiante, id_asesor } = req.query; // Obtener los parámetros id_estudiante y id_asesor desde la consulta

    // Si no se pasa ni el id_estudiante ni el id_asesor, se devuelve un error
    if (!id_estudiante && !id_asesor) {
      return res.status(400).json({ error: 'Se necesita al menos el ID del estudiante o el ID del asesor' });
    }

    // Definir la consulta base
    let query = 'SELECT mensaje, leida, fecha FROM notificaciones_informes WHERE';
    let queryParams = [];

    // Si se pasa el id_estudiante, añadir al filtro
    if (id_estudiante) {
      query += ' id_estudiante = ?';
      queryParams.push(id_estudiante);
    }

    // Si se pasa el id_asesor, añadir al filtro
    if (id_asesor) {
      // Si ya hay un filtro por id_estudiante, necesitamos usar un "AND"
      if (id_estudiante) {
        query += ' AND';
      }
      query += ' id_asesor = ?';
      queryParams.push(id_asesor);
    }

    // Ordenar las notificaciones por fecha en orden descendente
    query += ' ORDER BY fecha DESC';

    // Ejecutar la consulta con los parámetros
    db.query(query, queryParams, (err, results) => {
      if (err) {
        console.error('Error al obtener las notificaciones:', err);
        return res.status(500).json({ error: 'Hubo un error al obtener las notificaciones' });
      }

      // Verificar si hay resultados
      if (results.length === 0) {
        return res.status(404).json({ message: 'No se encontraron notificaciones.' });
      }

      // Responder con los mensajes de las notificaciones
      const notifications = results.map((row) => ({
        mensaje: row.mensaje,
        leida: row.leida,
        fecha: row.fecha
      }));

      res.status(200).json(notifications);
    });
  });


  //COMISION---------------------------------------------------------------------------------------

  // Ruta GET para obtener informe_final basado en el id_estudiante
  app.get('/api/informeFinal/:idEstudiante', (req, res) => {
    const { idEstudiante } = req.params;

    // Suponemos que hay una columna fecha_creacion para ordenar por fecha
    const query = `SELECT informe_final FROM informes_final WHERE id_estudiante = ? ORDER BY fecha_creacion DESC LIMIT 1`;

    db.query(query, [idEstudiante], (err, result) => {
        if (err) {
            console.error('Error al obtener el informe final:', err);
            return res.status(500).send('Error al obtener el informe final');
        }

        if (result.length > 0) {
            return res.status(200).json({ informe_final: result[0].informe_final });
        } else {
            return res.status(404).send('Informe final no encontrado');
        }
    });
  });

  // Ruta GET para obtener informe_final_asesoria basado en el id_asesor
  app.get('/api/informeFinalAsesoria/:idAsesor', (req, res) => {
    const { idAsesor } = req.params;

    // Suponemos que hay una columna fecha_creacion para ordenar por fecha
    const query = `SELECT informe_final_asesoria FROM informes_finalasesoria WHERE id_asesor = ? ORDER BY fecha_creacion DESC LIMIT 1`;

    db.query(query, [idAsesor], (err, result) => {
        if (err) {
            console.error('Error al obtener el informe final de asesoría:', err);
            return res.status(500).send('Error al obtener el informe final de asesoría');
        }

        if (result.length > 0) {
            return res.status(200).json({ informe_final_asesoria: result[0].informe_final_asesoria });
        } else {
            return res.status(404).send('Informe final de asesoría no encontrado');
        }
    });
  });

  app.put('/api/actualizar_estado_comision', (req, res) => {
    const { id_estudiante, estado_asesoria, estado_avance, estado_comision, comentario } = req.body;
  
    console.log("Datos recibidos:", req.body);  // Ver los datos recibidos en el servidor
  
    // Realizar la consulta SQL para actualizar los datos
    const query = `
      UPDATE informes_comision
      SET estado_informe_asesoria = ?, estado_revision_avance = ?, estado_informe_comision = ?, comentario_comision = ?
      WHERE id_estudiante = ?
    `;
  
    db.query(query, [estado_asesoria, estado_avance, estado_comision, comentario, id_estudiante], (err, results) => {
      if (err) {
        console.error("Error en la consulta SQL:", err);  // Mostrar el error detallado
        return res.status(500).json({ error: 'Error al actualizar el estado' });
      }
      res.json({ message: 'Estado y comentario actualizados correctamente' });
    });
  });
  




  

  app.put('/api/asignar_actualizar', (req, res) => {
    // Desestructuración de los datos recibidos en la solicitud
    const { id_estudiante, id_asesor, informe_final, informe_final_asesoria, id_revisor } = req.body;

    // Verificar que todos los campos necesarios existan
    if (!id_estudiante || !id_asesor || !informe_final || !informe_final_asesoria || !id_revisor) {
        return res.status(400).send('Faltan campos requeridos');
    }

    // Definir los valores de estado que se van a actualizar
    const estadoAvance = 'Pendiente';  
    const estadoAsesoria = 'Pendiente';

    // SQL para actualizar los informes en las tablas informes_final e informes_finalAsesoria
    const queryInformesFinal = `
      UPDATE informes_final 
      SET informe_final = ?, estado = ? 
      WHERE id_estudiante = ?
    `;
 
    const queryInformesFinalAsesoria = `
      UPDATE informes_finalAsesoria
      SET informe_final_asesoria = ?, estado = ? 
      WHERE id_asesor = ?
    `;
 
    // SQL para insertar en la tabla informes_revisados
    const queryInformesRevisados = `
      INSERT INTO informes_revisados (id_estudiante, id_asesor, informe_final, informe_final_asesoria, estado_final_informe, estado_final_asesoria, id_revisor, fecha_creacion)
      VALUES (?, ?, ?, ?, 'Pendiente', 'Pendiente', ?, NOW())
    `;

    // Ejecutar la actualización en la tabla informes_final
    db.query(queryInformesFinal, [informe_final, estadoAvance, id_estudiante], (err, result) => {
        if (err) {
            console.error('Error al actualizar informe final:', err);
            return res.status(500).send('Error al actualizar informe final');
        }

        // Ejecutar la actualización en la tabla informes_finalAsesoria
        db.query(queryInformesFinalAsesoria, [informe_final_asesoria, estadoAsesoria, id_asesor], (err, result) => {
            if (err) {
                console.error('Error al actualizar informe final de asesoría:', err);
                return res.status(500).send('Error al actualizar informe final de asesoría');
            }

            // Insertar en la tabla informes_revisados
            db.query(queryInformesRevisados, [id_estudiante, id_asesor, informe_final, informe_final_asesoria, id_revisor], (err, result) => {
                if (err) {
                    console.error('Error al insertar en informes revisados:', err);
                    return res.status(500).send('Error al insertar en informes revisados');
                }

                // Si todo es exitoso
                res.status(200).send('Informes actualizados y revisor asignado correctamente');
            });
        });
    });
  });

  

  // Obtener informes de estudiantes y asesores que tienen ambos informes aprobados
  app.get('/api/informes/comision', (req, res) => {
    const query = `
        SELECT
            estudiante.id AS id_estudiante,
            asesor.id AS id_asesor,
            informe_avance.estado AS estado_avance,
            informe_asesoria.estado AS estado_asesoria,
            informe_avance.informe_final AS informe_avance,
            informe_asesoria.informe_final_asesoria AS informe_asesoria
        FROM
            estudiantes estudiante
        LEFT JOIN informes_final informe_avance ON estudiante.id = informe_avance.id_estudiante
        LEFT JOIN informes_finalAsesoria informe_asesoria ON estudiante.id_asesor = informe_asesoria.id_asesor
        WHERE
            informe_avance.estado = 'Aprobado' AND
            informe_asesoria.estado = 'Aprobado';
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener los informes de la comisión:', err);
            return res.status(500).send('Error al obtener los informes');
        }
        res.send(results);
    });
  });


  // Obtener lista de revisores
  app.get('/api/revisores', (req, res) => {
    // Aquí obtienes los revisores de la base de datos, luego los devuelves como JSON
    db.query('SELECT * FROM revisores', (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al obtener los revisores' });
      }
      res.json(results);  // Respuesta en formato JSON
    });
  });

  // Asignar revisor y actualizar estados de los informes
  app.post('/api/asignarRevisor', upload.fields([
    { name: 'informe_final' }, 
    { name: 'informe_final_asesoria' }
  ]), (req, res) => {
      const {
          id_estudiante, 
          id_asesor, 
          id_revisor
      } = req.body;

      // Obtener los archivos
      const informe_final = req.files['informe_final'] ? req.files['informe_final'][0] : null;
      const informe_final_asesoria = req.files['informe_final_asesoria'] ? req.files['informe_final_asesoria'][0] : null;

      // Verificar que los campos requeridos estén presentes
      if (!id_estudiante || !id_asesor || !id_revisor || !informe_final) {
          return res.status(400).send('Faltan campos requeridos');
      }

      // Consulta para insertar los datos en la base de datos
      const query = `
          INSERT INTO informes_revisados 
          (id_estudiante, id_asesor, informe_final, informe_final_asesoria, id_revisor)
          VALUES (?, ?, ?, ?, ?)
      `;

      // Ejecutar la consulta para insertar los datos
      db.query(query, [
          id_estudiante, 
          id_asesor, 
          informe_final, 
          informe_final_asesoria, 
          id_revisor
      ], (err, result) => {
          if (err) {
              console.error('Error al asignar el revisor:', err);
              return res.status(500).send('Error al asignar el revisor');
          }
          res.status(200).send('Revisor asignado correctamente');
      });
    });
  

    app.get('/api/informes_comision', (req, res) => {
      // Consulta SQL optimizada para obtener solo los registros más recientes y evitar duplicados
      const query = `
          SELECT 
              a.id_estudiante,
              a.id_asesor,
              a.informe_asesoria,
              a.fecha_creacion AS fecha_creacion_asesoria,
              a.estado_informe_asesoria,
              b.informe_avance,
              b.fecha_creacion AS fecha_creacion_avance,
              b.estado_revision_avance,
              ir.estado_comision  -- Obtener el estado_comision de la tabla informes_revisados
          FROM 
              (
                  SELECT id_estudiante, id_asesor, informe_asesoria, fecha_creacion, estado_informe_asesoria
                  FROM informes_asesoria
                  WHERE (id_estudiante, id_asesor, fecha_creacion) IN 
                        (
                            SELECT id_estudiante, id_asesor, MAX(fecha_creacion)
                            FROM informes_asesoria
                            GROUP BY id_estudiante, id_asesor
                        )
              ) a
          JOIN 
              (
                  SELECT id_estudiante, id_asesor, informe_avance, fecha_creacion, estado_revision_avance
                  FROM informes_avance
                  WHERE (id_estudiante, id_asesor, fecha_creacion) IN 
                        (
                            SELECT id_estudiante, id_asesor, MAX(fecha_creacion)
                            FROM informes_avance
                            GROUP BY id_estudiante, id_asesor
                        )
              ) b
          ON a.id_estudiante = b.id_estudiante 
          AND a.id_asesor = b.id_asesor
          LEFT JOIN informes_revisados ir
          ON a.id_estudiante = ir.id_estudiante
          AND a.id_asesor = ir.id_asesor
      `;
      
      // Ejecutar la consulta en la base de datos
      db.query(query, (err, results) => {
          if (err) {
              // Si hay un error en la consulta, respondemos con un error 500
              return res.status(500).json({ error: 'Error al obtener los informes de la comisión.' });
          }
      
          // Si la consulta fue exitosa, respondemos con los resultados en formato JSON
          res.json(results);
      });
  });
  
    
    

  // Cambia la ruta de actualización de estado a actualización de informe


  app.put('/api/actualizar_informe', (req, res) => {
    const { id_estudiante, id_asesor, estado_informe_asesoria, estado_revision_avance } = req.body;

    // Comenzamos por actualizar la tabla de informes_asesoria
    let query = `
        UPDATE informes_asesoria
        SET estado_informe_asesoria = ?
        WHERE id_estudiante = ? AND id_asesor = ?;
    `;

    db.query(query, [estado_informe_asesoria, id_estudiante, id_asesor], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Error al actualizar el informe de asesoría.' });
        }

        // Luego actualizamos la tabla de informes_avance
        query = `
            UPDATE informes_avance
            SET estado_revision_avance = ?
            WHERE id_estudiante = ? AND id_asesor = ?;
        `;

        db.query(query, [estado_revision_avance, id_estudiante, id_asesor], (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Error al actualizar el informe de avance.' });
            }

            res.status(200).json({ message: 'Informes actualizados correctamente.' });
        });
    });
});


// Ruta para servir archivos estáticos (por ejemplo, archivos subidos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ruta para descargar archivos
app.get('/api/descargar/:filename', (req, res) => {
  const { filename } = req.params;

  // Especifica la carpeta donde se encuentran los archivos (por ejemplo, 'uploads')
  const filePath = path.join(__dirname, 'uploads', filename);

  // Verificar si el archivo existe
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send('Archivo no encontrado');
    }

    // Si el archivo existe, enviamos el archivo al cliente
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Error al enviar el archivo:', err);
        return res.status(500).send('Error al descargar el archivo');
      }
    });
  });
});




// Se asume que tienes una conexión de base de datos con algo como `db` (por ejemplo, con `mysql2` o `sequelize`)



app.put('/api/actualizacion_informe', (req, res) => {
  const { id_estudiante, estado_informe_asesoria, estado_informe_avance, id_asesor } = req.body;

  // Verificar que todos los datos necesarios estén presentes
  console.log("Datos recibidos en el backend:", req.body);  // Verifica lo que recibes en el backend

  if (!id_estudiante || !estado_informe_asesoria || !estado_informe_avance || !id_asesor) {
    return res.status(400).json({ error: 'Faltan datos necesarios (id_estudiante, estado_informe_asesoria, estado_informe_avance, id_asesor)' });
  }

  // Usamos una transacción para actualizar ambos registros de forma segura
  const sql1 = `
    UPDATE informes_asesoria
    SET estado_informe_asesoria = ?, id_asesor = ?
    WHERE id_estudiante = ?
  `;
  const sql2 = `
    UPDATE informes_avance
    SET estado_revision_avance = ?, id_asesor = ?
    WHERE id_estudiante = ?
  `;

  // Comenzamos una transacción para asegurar que ambos registros se actualicen correctamente
  db.beginTransaction(function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error en la transacción' });
    }

    // Actualización del estado del informe de asesoría
    db.query(sql1, [estado_informe_asesoria, id_asesor, id_estudiante], function (err1, result1) {
      if (err1) {
        return db.rollback(function() {
          return res.status(500).json({ error: 'Error al actualizar informe de asesoría' });
        });
      }

      // Actualización del estado del informe de avance
      db.query(sql2, [estado_informe_avance, id_asesor, id_estudiante], function (err2, result2) {
        if (err2) {
          return db.rollback(function() {
            return res.status(500).json({ error: 'Error al actualizar informe de avance' });
          });
        }

        // Si ambos updates fueron exitosos, commit la transacción
        db.commit(function(err3) {
          if (err3) {
            return db.rollback(function() {
              return res.status(500).json({ error: 'Error en el commit de la transacción' });
            });
          }
          res.status(200).json({ mensaje: 'Informe actualizado correctamente' });
        });
      });
    });
  });
});








  // Ruta para enviar notificaciones
  // Ruta para crear notificación
  app.post('/api/notificar', (req, res) => {
    const { id_estudiante, estado_avance, estado_asesoria, id_asesor } = req.body;

    const mensaje = `El estado de su informe de avance es: ${estado_avance}. El estado de su informe de asesoría es: ${estado_asesoria}.`;

    // Inserta la notificación para el estudiante
    const query = `
      INSERT INTO notificaciones_informes (id_estudiante, id_asesor, estado_avance, estado_asesoria, mensaje)
      VALUES (?, ?, ?, ?, ?);
    `;

    db.query(query, [id_estudiante, id_asesor, estado_avance, estado_asesoria, mensaje], (err, result) => {
      if (err) {
        console.error('Error al insertar la notificación:', err);
        return res.status(500).json({ error: 'Error al insertar la notificación' });
      }
      res.status(200).json({ message: 'Notificación enviada correctamente' });
    });
  });

  


  //ASESORRRRRR:

  // Endpoint para obtener los estudiantes con sus informes de asesoría

  app.get('/api/estudiantes', (req, res) => {
    // Consulta SQL para obtener los asesores
    const query = 'SELECT id, nombres, apellido_paterno, apellido_materno,dni,correo,celular FROM estudiantes';

    // Ejecuta la consulta a la base de datos
    db.query(query, (err, results) => {
      if (err) {
        // Si hay un error en la consulta, responde con un error 500
        return res.status(500).json({ error: 'Error al obtener los asesores.' });
      }

      // Si la consulta fue exitosa, responde con los resultados en formato JSON
      res.json(results);
    });
  });

  app.post('/api/informes/asesoria', upload.single('asesoria'), (req, res) => {
    const { id_asesor, id_estudiante } = req.body;
    const informe_asesoria = req.file ? req.file.filename : null;
  
    if (!id_estudiante || !id_asesor || !informe_asesoria) {
      return res.status(400).json({ error: 'Informe de asesoría, estudiante y asesor requeridos.' });
    }
  
    const query = `
      INSERT INTO informes_asesoria (id_estudiante, id_asesor, informe_asesoria)
      VALUES (?, ?, ? )
    `;
    db.query(query, [id_estudiante, id_asesor, informe_asesoria], (err, result) => {
      if (err) {
        console.error('Error al guardar el informe de asesoría:', err);
        return res.status(500).json({ error: 'Error al guardar el informe de asesoría.' });
      }
      res.status(200).json({ message: 'Informe de asesoría enviado correctamente.' });
    });
  });
  
  // Endpoint para recibir el informe de avance
  app.post('/api/informes/avance', upload.single('avance'), (req, res) => {
    const { id_estudiante, id_asesor } = req.body;
    const informe_avance = req.file ? req.file.filename : null;

    if (!id_estudiante || !id_asesor || !informe_avance) {
      return res.status(400).json({ error: 'Informe de avance, estudiante y asesor requeridos.' });
    }

    const query = `
      INSERT INTO informes_avance (id_estudiante, id_asesor, informe_avance)
      VALUES (?, ?, ?)
    `;
    db.query(query, [id_estudiante, id_asesor, informe_avance], (err, result) => {
      if (err) {
        console.error('Error al guardar el informe de avance:', err);
        return res.status(500).json({ error: 'Error al guardar el informe de avance.' });
      }
      res.status(200).json({ message: 'Informe de avance enviado correctamente.' });
    });
  });




  // Endpoint para obtener la lista de asesores
  app.get('/api/asesores', (req, res) => {
    // Consulta SQL para obtener los asesores
    const query = 'SELECT id, dni, nombre_asesor, apellido_paterno, apellido_materno,correo FROM asesores';

    // Ejecuta la consulta a la base de datos
    db.query(query, (err, results) => {
      if (err) {
        // Si hay un error en la consulta, responde con un error 500
        return res.status(500).json({ error: 'Error al obtener los asesores.' });
      }

      // Si la consulta fue exitosa, responde con los resultados en formato JSON
      res.json(results);
    });
  });





  // Endpoint para obtener todos los informes de avance
  app.get('/api/informes', (req, res) => {
    const query = 'SELECT * FROM informes_avance';
    db.query(query, (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Error al obtener los informes.' });
      }
      res.json(results);
    });
  });



  app.post('/api/informes/ampliacion', upload.single('ampliacion'), (req, res) => {
    const { id_estudiante } = req.body;
    const ampliacion = req.file.filename;

    const query = 'INSERT INTO informes_ampliacion (id_estudiante, ampliacion) VALUES (?, ?)';
    db.query(query, [id_estudiante, ampliacion], (err, result) => {
      if (err) {
        console.error('Error al guardar la solicitud de ampliación:', err);
        return res.status(500).send('Error al guardar la solicitud de ampliación');
      }
      res.send({ message: 'Solicitud de ampliación recibida exitosamente' });
    });
  });

  //ESTO ES PARA LA VISTA DE ESTUDIANTE CUANDO ENVIA SU INFORME FINAL DE AVANCE-------------

  app.post('/api/informes/final', upload.single('final'), (req, res) => {
    const { id_estudiante } = req.body;
    const final = req.file.filename;

    const query = 'INSERT INTO informes_final (id_estudiante, informe_final, estado) VALUES (?, ?, ?)';
    db.query(query, [id_estudiante, final, 'Pendiente'], (err, result) => {
      if (err) {
        console.error('Error al guardar el informe final:', err);
        return res.status(500).send('Error al guardar el informe final');
      }
      res.send({ message: 'Informe final recibido exitosamente' });
    });
  });

  //ESTO ES PARA LA VISTA DE ASESOR CUANDO ENVIA SU INFORME FINAL DE ASESORIA-------------
  app.post('/api/informes/finalAsesoria', upload.single('finalAsesoria'), (req, res) => {
    const { id_asesor } = req.body;
    const finalAsesoria = req.file.filename;

    const query = 'INSERT INTO informes_finalAsesoria (id_asesor, informe_final_asesoria, estado) VALUES (?, ?, ?)';
    db.query(query, [id_asesor, finalAsesoria, 'Pendiente'], (err, result) => {
      if (err) {
        console.error('Error al guardar el informe final Asesoria:', err);
        return res.status(500).send('Error al guardar el informe final Aaesoria');
      }
      res.send({ message: 'Informe final Asesoria recibido exitosamente' });
    });
  });

  // Ruta para actualizar el estado del informe
  app.put('/api/actualizar-estado', (req, res) => {
    const { idInforme, estado } = req.body;
    const query = 'UPDATE informes SET estado = ? WHERE id = ?';
    db.query(query, [estado, idInforme], (err, result) => {
      if (err) {
        console.error('Error al actualizar el estado:', err);
        return res.status(500).send('Error al actualizar el estado');
      }
      sendEmailToStudent(idInforme, `Tu informe ha sido actualizado a ${estado}`);
      res.send({ message: 'Estado actualizado' });
    });
  });

  // Función para enviar correo electrónico al estudiante
  function sendEmailToStudent(idInforme, message) {
    // Configuración del servicio de correo
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'your_email@gmail.com',
        pass: 'your_email_password' // Usa contraseñas de aplicación si es necesario
      }
    });

    // Consulta para obtener el correo electrónico del estudiante
    const query = 'SELECT email FROM estudiantes WHERE id_estudiante = ?';
    db.query(query, [idInforme], (err, result) => {
      if (err) {
        console.error('Error al obtener el correo del estudiante:', err);
        return;
      }
      const studentEmail = result[0].email;

      const mailOptions = {
        from: 'your_email@gmail.com',
        to: studentEmail,
        subject: 'Actualización de Estado de Informe',
        text: message
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Error al enviar correo:', error);
          return;
        }
        console.log('Correo enviado: ' + info.response);
      });
    });
  };

  // Ruta para obtener todos los informes
  app.get('/api/informes', (req, res) => {
    const query = 'SELECT * FROM informes'; // Asegúrate de usar la tabla correcta (informe_avance, informe_asesoria, etc.)
    db.query(query, (err, results) => {
      if (err) {
        console.error('Error al obtener los informes:', err);
        return res.status(500).send('Error al obtener los informes');
      }
      if (results.length === 0) {
        return res.status(404).send('No se presentan registros');
      }
      res.json(results);
    });
  });

/////PROCESO 3  ------------------------------------------------------------------------------------------------------------------
  // Función para agregar una notificación

  // API para enviar una notificación
  app.post('/api/notificar_inscripciones', (req, res) => {
    const { id_estudiante, mensaje, leida, fecha } = req.body;

    const query = `
        INSERT INTO notificaciones_inscripciones (id_estudiante, mensaje, leida, fecha)
        VALUES (?, ?, ?, ?);
    `;

    db.execute(query, [id_estudiante, mensaje, leida, fecha], (err, result) => {
        if (err) {
            console.error('Error al insertar la notificación:', err);
            return res.status(500).json({ error: 'Error al insertar la notificación' });
        }
        res.status(200).json({ message: 'Notificación enviada correctamente' });
    });
  });

// API para obtener las notificaciones de un estudiante
  app.get('/api/notificaciones_incripciones', (req, res) => {
      const { id_estudiante } = req.query;

      const query = `
          SELECT * FROM notificaciones_inscripciones
          WHERE id_estudiante = ?
          ORDER BY fecha DESC;
      `;

      db.execute(query, [id_estudiante], (err, results) => {
          if (err) {
              console.error('Error al obtener notificaciones:', err);
              return res.status(500).json({ error: 'Error al obtener notificaciones' });
          }
          res.status(200).json(results);
      });
  });

  // API para obtener certificados de prácticas de un estudiante
  app.get('/api/certificados_practicas', (req, res) => {
    const { id_estudiante } = req.query;
  
    const query = `
      SELECT * FROM certificados_practicas
      WHERE id_estudiante = ?
      ORDER BY fecha_creacion DESC
      LIMIT 1;  -- Esto asegura que solo obtienes el certificado más reciente
    `;
  
    db.execute(query, [id_estudiante], (err, results) => {
      if (err) {
        console.error('Error al obtener certificado:', err);
        return res.status(500).json({ error: 'Error al obtener certificado' });
      }
      if (results.length > 0) {
        res.status(200).json(results[0]); // Devolvemos solo el primer resultado, que es el más reciente
      } else {
        res.status(404).json({ message: 'No se encontró el certificado.' }); // Si no hay certificado
      }
    });
  });


  ////ADMINISTRADO VISTA DEL ADMIN------------------------------------------------------------------------------------------------------------------------------------------------------------------
  

  // Obtener todos los usuarios
  app.get('/api/usuarios', (req, res) => {
    const query = 'SELECT id, correo, rol, fecha_creacion FROM usuarios';
    db.query(query, (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Error al obtener los usuarios' });
      }
      res.json(results);
    });
  });

  // Crear un nuevo usuario
  app.post('/api/crear_usuario', async (req, res) => {
    const { correo, password, rol } = req.body;
    
    if (!correo || !password || !rol) {
      return res.status(400).json({ error: 'Campos incompletos' });
    }
  
    // Encriptar la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);
  
    const query = 'INSERT INTO usuarios (correo, password, rol) VALUES (?, ?, ?)';
    db.query(query, [correo, hashedPassword, rol], (err, result) => {
      if (err) {
        console.error('Error en la consulta:', err);
        return res.status(500).json({ error: 'Error al crear el usuario' });
      }
      res.status(201).json({ message: 'Usuario creado correctamente' });
    });
  });
  

  // Editar un usuario
  app.put('/api/editar_usuario/:id', async (req, res) => {
    const { id } = req.params;
    const { correo, password, rol } = req.body;

    // Si hay una nueva contraseña, la encriptamos
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const query = 'UPDATE usuarios SET correo = ?, password = ?, rol = ? WHERE id = ?';

    db.query(query, [correo, hashedPassword || '', rol, id], (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Error al actualizar el usuario' });
      }
      res.json({ message: 'Usuario actualizado correctamente' });
    });
  });

  // Eliminar un usuario
  app.delete('/api/eliminar_usuario/:id', (req, res) => {
    const { id } = req.params;

    const query = 'DELETE FROM usuarios WHERE id = ?';
    db.query(query, [id], (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Error al eliminar el usuario' });
      }
      res.json({ message: 'Usuario eliminado correctamente' });
    });
  });


  // Endpoint para restablecer la contraseña de un usuario
// Endpoint para restablecer la contraseña de un usuario
// Endpoint para restablecer la contraseña de un usuario
  app.put("/api/restablecer_password/:id", async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: "La nueva contraseña es requerida" });
    }

    // Cifrar la nueva contraseña
    try {
      const saltRounds = 10;  // Número de rondas de salt para bcrypt
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Actualizar la contraseña en la base de datos
      const query = "UPDATE usuarios SET password = ? WHERE id = ?";
      db.query(query, [hashedPassword, id], (err, result) => {
        if (err) {
          console.error("Error al actualizar la contraseña:", err);
          return res.status(500).json({ error: "Error al actualizar la contraseña" });
        }

        // Si la actualización fue exitosa
        return res.status(200).json({ message: "Contraseña restablecida correctamente" });
      });
    } catch (error) {
      console.error("Error al cifrar la contraseña:", error);
      return res.status(500).json({ error: "Error al cifrar la contraseña" });
    }
  });

  // Endpoint para crear un estudiante
  app.post('/api/crear_estudiante', async (req, res) => {
    const { correo, nombres, apellido_paterno, apellido_materno, dni, celular, fecha_nacimiento } = req.body;
  
    // Validar que todos los campos estén presentes
    if (!correo || !nombres || !apellido_paterno || !apellido_materno || !dni || !celular || !fecha_nacimiento) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
  
    // Validar que el correo tenga formato válido (simple)
    const correoRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!correoRegex.test(correo)) {
      return res.status(400).json({ error: 'Correo no válido' });
    }
  
    // Validar que el DNI tenga 8 dígitos
    if (!/^\d{8}$/.test(dni)) {
      return res.status(400).json({ error: 'El DNI debe contener 8 dígitos numéricos' });
    }
  
    // Validar que el celular tenga 9 dígitos
    if (!/^\d{9}$/.test(celular)) {
      return res.status(400).json({ error: 'El celular debe contener 9 dígitos numéricos' });
    }
  
    // Validar la fecha de nacimiento
    const fechaNacimiento = new Date(fecha_nacimiento);
    const today = new Date();
    if (fechaNacimiento > today) {
      return res.status(400).json({ error: 'La fecha de nacimiento no puede ser mayor que la fecha actual' });
    }
  
    // Consultar si ya existe un estudiante con el mismo correo, dni o celular
    const queryCheck = 'SELECT * FROM estudiantes WHERE correo = ? OR dni = ? OR celular = ?';
    db.query(queryCheck, [correo, dni, celular], (err, results) => {
      if (err) {
        console.error('Error al consultar en la base de datos:', err);
        return res.status(500).json({ error: 'Error al consultar la base de datos' });
      }
  
      if (results.length > 0) {
        return res.status(400).json({ error: 'Ya existe un estudiante con ese correo, dni o celular' });
      }
  
      // Insertar los datos del estudiante en la base de datos
      const query = 'INSERT INTO estudiantes (correo, nombres, apellido_paterno, apellido_materno, dni, celular, fecha_nacimiento) VALUES (?, ?, ?, ?, ?, ?, ?)';
      db.query(query, [correo, nombres, apellido_paterno, apellido_materno, dni, celular, fecha_nacimiento], (err, result) => {
        if (err) {
          console.error('Error al crear el estudiante:', err);
          return res.status(500).json({ error: 'Error al crear el estudiante' });
        }
  
        res.status(201).json({ message: 'Estudiante creado correctamente' });
      });
    });
  });

  app.post('/api/crear_asesor', async (req, res) => {
    const { correo, especialidad, fecha_ingreso, nombre_asesor, apellido_paterno, apellido_materno, dni } = req.body;
  
    if (!correo || !especialidad || !fecha_ingreso || !nombre_asesor || !apellido_paterno || !apellido_materno || !dni) {
      return res.status(400).json({ error: 'Campos incompletos' });
    }
  
    const query = 'INSERT INTO asesores (correo, especialidad, fecha_ingreso, nombre_asesor, apellido_paterno, apellido_materno, dni) VALUES (?, ?, ?, ?, ?, ?, ?)';
  
    db.query(query, [correo, especialidad, fecha_ingreso, nombre_asesor, apellido_paterno, apellido_materno, dni], (err, result) => {
      if (err) {
        console.error('Error en la consulta:', err);
        return res.status(500).json({ error: 'Error al crear el asesor' });
      }
      res.status(201).json({ message: 'Asesor creado correctamente' });
    });
  });
  
  app.post('/api/crear_revisor', async (req, res) => {
    const { correo, nombre_revisor, apellido_paterno, apellido_materno, dni, especialidad, fecha_ingreso } = req.body;
  
    if (!correo || !nombre_revisor || !apellido_paterno || !apellido_materno || !dni || !especialidad || !fecha_ingreso) {
      return res.status(400).json({ error: 'Campos incompletos' });
    }
  
    const query = 'INSERT INTO revisores (correo, nombre_revisor, apellido_paterno, apellido_materno, dni, especialidad, fecha_ingreso) VALUES (?, ?, ?, ?, ?, ?, ?)';
  
    db.query(query, [correo, nombre_revisor, apellido_paterno, apellido_materno, dni, especialidad, fecha_ingreso], (err, result) => {
      if (err) {
        console.error('Error en la consulta:', err);
        return res.status(500).json({ error: 'Error al crear el revisor' });
      }
      res.status(201).json({ message: 'Revisor creado correctamente' });
    });
  });


  //APIS PARAA EDITAR Y ACTULIAR DATOS DEL ESTUDAINTE---------------------------------------------------
  // Endpoint para actualizar los datos del estudiante
  app.put('/api/editar_estudiante/:id', (req, res) => {
    const { id } = req.params;
    console.log('Actualizando estudiante con ID:', id); // Agregar un log para verificar la ID que recibe
    const { nombres, apellido_paterno, apellido_materno, correo, dni, celular } = req.body;
    console.log('Datos recibidos:', { nombres, apellido_paterno, apellido_materno, correo, dni, celular });
  
    const query = `
      UPDATE estudiantes 
      SET nombres = ?, apellido_paterno = ?, apellido_materno = ?, correo = ?, dni = ?, celular = ? 
      WHERE id = ?
    `;
    
    db.query(query, [nombres, apellido_paterno, apellido_materno, correo, dni, celular, id], (err, result) => {
      if (err) {
        console.error('Error al actualizar los datos del estudiante:', err);
        return res.status(500).send('Error al actualizar los datos del estudiante');
      }
  
      if (result.affectedRows > 0) {
        return res.status(200).send({ message: 'Estudiante actualizado correctamente' });
      } else {
        return res.status(404).send({ message: 'Estudiante no encontrado' });
      }
    });
  });

  app.delete('/api/eliminar_estudiante/:id', (req, res) => {
    const { id } = req.params;

    // Consulta SQL para eliminar el estudiante por su ID
    const query = 'DELETE FROM estudiantes WHERE id = ?';

    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error al eliminar el estudiante:', err);
            return res.status(500).send('Hubo un error al eliminar el estudiante');
        }

        if (result.affectedRows > 0) {
            return res.status(200).send({ message: 'Estudiante eliminado correctamente' });
        } else {
            return res.status(404).send({ message: 'Estudiante no encontrado' });
        }
    });
  });

  // Eliminar un usuario por correo
  app.delete('/api/eliminar_usuario_estudiante/:correo', (req, res) => {
    const { correo } = req.params;  // Obtenemos el correo desde los parámetros de la URL

    // Hacer la consulta para eliminar al usuario cuyo correo coincida
    const query = 'DELETE FROM usuarios WHERE correo = ?';
    db.query(query, [correo], (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Error al eliminar el usuario' });
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'No se encontró el usuario con ese correo' });
      }

      res.json({ message: 'Usuario eliminado correctamente' });
    });
  });

  //PROCESO 4--------------------------------PROCESO 4--------------------------------PROCESO 4------------------4

  // Ruta para obtener los registros de convalidación
  app.get('/api/convalidaciones_experiencia', (req, res) => {
    const query = 'SELECT * FROM convalidaciones_experiencias';
    db.query(query, (err, results) => {
      if (err) {
        console.error('Error al obtener convalidaciones:', err);
        return res.status(500).send('Error al obtener convalidaciones');
      }
      res.json(results);
    });
  });

  // Ruta para obtener los revisores
  app.get('/api/revisores', (req, res) => {
    const query = 'SELECT * FROM revisores';
    db.query(query, (err, results) => {
      if (err) {
        console.error('Error al obtener revisores:', err);
        return res.status(500).send('Error al obtener revisores');
      }
      res.json(results);
    });
  });
  
  //CUANDO SECRETARIA DA EN ACTUALIZAR
  // Ruta para editar una convalidación (actualizar registro)
  app.put('/api/editar_convalidacion/:id_estudiante', async (req, res) => {
    try {
      const idEstudiante = req.params.id_estudiante;  // Obtener el ID del estudiante de la URL
      const { estado_inscripcion, comentario_inscripcion } = req.body;  // Obtener los datos del cuerpo de la solicitud
  
      console.log('Datos recibidos para actualizar:');
      console.log(`ID Estudiante: ${idEstudiante}`);
      console.log(`Nuevo estado de inscripción: ${estado_inscripcion}`);
      console.log(`Nuevo comentario de inscripción: ${comentario_inscripcion}`);
  
      // Consulta SQL para actualizar solo el estado y el comentario del registro con el ID del estudiante
      const query = `
        UPDATE convalidaciones_experiencias
        SET estado_inscripcion = ?, comentario_inscripcion = ?
        WHERE id_estudiante = ?
      `;
  
      // Ejecutar la consulta
      db.query(query, [estado_inscripcion, comentario_inscripcion, idEstudiante], (err, result) => {
        if (err) {
          console.error('Error al ejecutar la consulta:', err);
          return res.status(500).json({ error: 'Error al actualizar el estado de inscripción.' });
        }
  
        // Verificar si se actualizó un registro
        if (result.affectedRows === 0) {
          console.error('No se encontró el estudiante con el ID:', idEstudiante);
          return res.status(404).json({ error: 'No se encontró el registro para actualizar.' });
        }
  
        console.log('Registro actualizado correctamente');
        res.status(200).json({ message: 'Estado de inscripción actualizado correctamente.' });
      });
  
    } catch (error) {
      console.error('Error al procesar la solicitud de actualización:', error);
      res.status(500).json({ error: 'Error al procesar la solicitud de actualización.' });
    }
  });


  //CUANOD COMISION DA EN ACTUALIZAR
  app.put('/api/editar_convalidacion_comision/:id_estudiante', async (req, res) => {
    try {
      const idEstudiante = req.params.id_estudiante;  // Obtener el ID del estudiante de la URL
      const { estado_solicitud_inscripcion, estado_plan_convalidacion, observacion_comision, id_revisor } = req.body;  // Obtener los datos del cuerpo de la solicitud
  
      console.log('Datos recibidos para actualizar:');
      console.log(`ID Estudiante: ${idEstudiante}`);
      console.log(`Nuevo estado de solicitud: ${estado_solicitud_inscripcion}`);
      console.log(`Nuevo estado de plan de convalidación: ${estado_plan_convalidacion}`);
      console.log(`Nueva observación de comisión: ${observacion_comision}`);
      console.log(`Nuevo ID de Revisor: ${id_revisor}`);
  
      // Asegurarse de que si id_revisor es una cadena vacía, se convierta en NULL
      const idRevisorFinal = id_revisor === '' ? null : id_revisor;
  
      // Consulta SQL para actualizar el estado de inscripción, el estado del plan de convalidación y la observación de comisión
      const query = `
        UPDATE convalidaciones_experiencias
        SET estado_solicitud_inscripcion = ?, estado_plan_convalidacion = ?, observacion_comision = ?, id_revisor = ?
        WHERE id_estudiante = ?
      `;
  
      // Ejecutar la consulta
      db.query(query, [estado_solicitud_inscripcion, estado_plan_convalidacion, observacion_comision, idRevisorFinal, idEstudiante], (err, result) => {
        if (err) {
          console.error('Error al ejecutar la consulta:', err);
          return res.status(500).json({ error: 'Error al actualizar la convalidación.' });
        }
  
        // Verificar si se actualizó un registro
        if (result.affectedRows === 0) {
          console.error('No se encontró el estudiante con el ID:', idEstudiante);
          return res.status(404).json({ error: 'No se encontró el registro para actualizar.' });
        }
  
        console.log('Registro de convalidación actualizado correctamente');
        res.status(200).json({ message: 'Convalidación actualizada correctamente.' });
      });
  
    } catch (error) {
      console.error('Error al procesar la solicitud de actualización:', error);
      res.status(500).json({ error: 'Error al procesar la solicitud de actualización.' });
    }
  });
  
  
  
  
  

  // Ruta para editar un registro de convalidación (Estado de informe y notificación)
  app.put('/api/editar_informe_convalidacion/:id', (req, res) => {
    const { id } = req.params;
    console.log('Actualizando informe de convalidación con ID:', id);

    const { estado_informe_convalidacion, comentario_convalidacion } = req.body;

    console.log('Datos recibidos:', { estado_informe_convalidacion, comentario_convalidacion });

    const query = `
      UPDATE convalidaciones_experiencias
      SET 
        estado_informe_convalidacion = ?, 
        comentario_convalidacion = ?
      WHERE id = ?
    `;

    db.query(query, [estado_informe_convalidacion, comentario_convalidacion, id], (err, result) => {
      if (err) {
        console.error('Error al actualizar el informe de convalidación:', err);
        return res.status(500).send('Error al actualizar el informe de convalidación');
      }

      if (result.affectedRows > 0) {
        return res.status(200).send({ message: 'Informe de convalidación actualizado correctamente' });
      } else {
        return res.status(404).send({ message: 'Informe de convalidación no encontrado' });
      }
    });
  });

  // Ruta para editar el estado de la solicitud de revisión
  // Ruta para editar el estado de la solicitud de revisión usando id_estudiante
  app.put('/api/editar_revision/:id_estudiante', (req, res) => {
    const { id_estudiante } = req.params;  // Obtenemos el id_estudiante de la URL
    console.log('Actualizando solicitud de revisión con ID Estudiante:', id_estudiante);

    const { estado_revision, comentario_revision } = req.body;

    console.log('Datos recibidos:', { estado_revision, comentario_revision });

    // Query para actualizar el estado de revisión y el comentario en la base de datos
    const query = `
      UPDATE convalidaciones_experiencias
      SET 
        estado_revision = ?, 
        comentario_revision = ?
      WHERE id_estudiante = ?
    `;

    db.query(query, [estado_revision, comentario_revision, id_estudiante], (err, result) => {
      if (err) {
        console.error('Error al actualizar la solicitud de revisión:', err);
        return res.status(500).send('Error al actualizar la solicitud de revisión');
      }

      if (result.affectedRows > 0) {
        return res.status(200).send({ message: 'Solicitud de revisión actualizada correctamente' });
      } else {
        return res.status(404).send({ message: 'Solicitud de revisión no encontrada' });
      }
    });
  });


  // Ruta para editar el estado de remisión (última etapa)
  app.put('/api/editar_remision/:id_estudiante', (req, res) => { 
    const { id_estudiante } = req.params;  // Obtener el id_estudiante de los parámetros de la URL
    console.log('Actualizando estado de remisión con ID:', id_estudiante);
  
    const { estado_remitir } = req.body;  // Obtener el estado_remitir del cuerpo de la solicitud
    console.log('Datos recibidos:', { estado_remitir });
  
    // Asegúrate de que el valor de estado_remitir no sea vacío antes de ejecutar la actualización
    if (estado_remitir === undefined || estado_remitir === '') {
      return res.status(400).json({ message: 'El campo estado_remitir es requerido' });
    }
  
    // Crear la consulta SQL para actualizar el campo estado_remitir del registro correspondiente
    const query = `
      UPDATE convalidaciones_experiencias
      SET estado_remitir = ?
      WHERE id_estudiante = ?
    `;
  
    // Ejecutar la consulta SQL
    db.query(query, [estado_remitir, id_estudiante], (err, result) => {
      if (err) {
        console.error('Error al actualizar el estado_remitir:', err);
        return res.status(500).json({ message: 'Error al actualizar el estado_remitir' });
      }
  
      // Responder si la actualización fue exitosa
      if (result.affectedRows > 0) {
        console.log('Estado de remitir actualizado con éxito para el estudiante con ID:', id_estudiante);
        return res.status(200).json({ message: 'Estado de remitir actualizado correctamente' });
      } else {
        console.log('No se encontró el estudiante con el ID:', id_estudiante);
        return res.status(404).json({ message: 'Estudiante no encontrado' });
      }
    });
  });
  

  // Endpoint para registrar la convalidación (incluyendo el id_estudiante)

  app.post('/api/registrar_convalidacion', upload.fields([
    { name: 'solicitud_inscripcion', maxCount: 1 },
    { name: 'plan_convalidacion', maxCount: 1 },
  ]), async (req, res) => {
    try {
      // Verificar si los archivos fueron cargados
      if (!req.files.solicitud_inscripcion || !req.files.plan_convalidacion) {
        return res.status(400).json({ error: 'Debe subir ambos archivos para enviar.' });
      }
  
      // Obtener los archivos desde req.files
      const solicitudInscripcionPath = req.files.solicitud_inscripcion[0].path;
      const planConvalidacionPath = req.files.plan_convalidacion[0].path;
      
      // Obtener el id_estudiante desde el cuerpo de la solicitud
      const { id_estudiante } = req.body;
  
      // Verificar si id_estudiante está presente
      if (!id_estudiante) {
        return res.status(400).json({ error: 'El id_estudiante es requerido.' });
      }
  
      // Primero, verificar si ya existe un registro con ese id_estudiante
      const checkQuery = 'SELECT * FROM convalidaciones_experiencias WHERE id_estudiante = ?';
      db.query(checkQuery, [id_estudiante], (err, result) => {
        if (err) {
          console.error('Error en la consulta:', err);
          return res.status(500).json({ error: 'Error al verificar el registro.' });
        }
  
        // Si el registro ya existe, actualizamos
        if (result.length > 0) {
          const updateQuery = `
            UPDATE convalidaciones_experiencias
            SET solicitud_inscripcion = ?, plan_convalidacion = ?
            WHERE id_estudiante = ?
          `;
          db.query(updateQuery, [solicitudInscripcionPath, planConvalidacionPath, id_estudiante], (err, updateResult) => {
            if (err) {
              console.error('Error al actualizar el registro:', err);
              return res.status(500).json({ error: 'Error al actualizar la convalidación.' });
            }
            res.status(200).json({ message: 'Archivos actualizados correctamente.' });
          });
        } else {
          // Si no existe, insertamos un nuevo registro
          const insertQuery = 'INSERT INTO convalidaciones_experiencias (id_estudiante, solicitud_inscripcion, plan_convalidacion) VALUES (?, ?, ?)';
          db.query(insertQuery, [id_estudiante, solicitudInscripcionPath, planConvalidacionPath], (err, insertResult) => {
            if (err) {
              console.error('Error al insertar el registro:', err);
              return res.status(500).json({ error: 'Error al registrar la convalidación.' });
            }
            res.status(201).json({ message: 'Archivos registrados correctamente.' });
          });
        }
      });
    } catch (error) {
      console.error('Error al registrar la convalidación:', error);
      res.status(500).json({ error: 'Error al procesar los archivos.' });
    }
  });
  

  //VISTA DE ESTUDAINTE PARA QUE  ENVIE ARCHIVOS ADICIONALES -------------------

  // Endpoint PUT para enviar archivos adicionales
  app.put('/api/enviar_archivos_adicionales/:id_estudiante', upload.fields([
    { name: 'informe_convalidacion', maxCount: 1 },
    { name: 'solicitud_revision', maxCount: 1 }
  ]), async (req, res) => {
    try {
      const idEstudiante = req.params.id_estudiante;
  
      // Verificar si los archivos fueron cargados
      if (!req.files['informe_convalidacion'] || !req.files['solicitud_revision']) {
        return res.status(400).json({ error: 'Debe subir ambos archivos para enviar.' });
      }
  
      // Obtener las rutas de los archivos subidos
      const informeConvalidacion = req.files['informe_convalidacion'][0].path;
      const solicitudRevision = req.files['solicitud_revision'][0].path;
  
      // Verificar que el id_estudiante está presente
      if (!idEstudiante) {
        return res.status(400).json({ error: 'El id_estudiante es requerido.' });
      }
  
      // Consultamos si ya existe un registro para este estudiante
      const checkQuery = 'SELECT * FROM convalidaciones_experiencias WHERE id_estudiante = ?';
      db.query(checkQuery, [idEstudiante], (err, result) => {
        if (err) {
          console.error('Error en la consulta:', err);
          return res.status(500).json({ error: 'Error al verificar el registro.' });
        }
  
        // Si el registro ya existe, actualizamos
        if (result.length > 0) {
          const updateQuery = `
            UPDATE convalidaciones_experiencias
            SET informe_convalidacion = ?, solicitud_revision = ?
            WHERE id_estudiante = ?
          `;
          db.query(updateQuery, [informeConvalidacion, solicitudRevision, idEstudiante], (err, updateResult) => {
            if (err) {
              console.error('Error al actualizar el registro:', err);
              return res.status(500).json({ error: 'Error al actualizar los archivos.' });
            }
            res.status(200).json({ message: 'Archivos actualizados correctamente.' });
          });
        } else {
          // Si no existe el registro, lo insertamos
          const insertQuery = 'INSERT INTO convalidaciones_experiencias (id_estudiante, informe_convalidacion, solicitud_revision) VALUES (?, ?, ?)';
          db.query(insertQuery, [idEstudiante, informeConvalidacion, solicitudRevision], (err, insertResult) => {
            if (err) {
              console.error('Error al insertar el registro:', err);
              return res.status(500).json({ error: 'Error al registrar los archivos.' });
            }
            res.status(201).json({ message: 'Archivos registrados correctamente.' });
          });
        }
      });
    } catch (error) {
      console.error('Error al procesar los archivos:', error);
      res.status(500).json({ error: 'Error al procesar los archivos.' });
    }
  });

  ///para la vista de REVISOR ------------------------------------------------------------------------------------

  // Ruta para actualizar estado de informe y comentario de convalidación
  app.put('/api/subir_convalidacion/:id_estudiante', (req, res) => {
    const { id_estudiante } = req.params; // Obtener el id_estudiante desde la URL
    console.log('Actualizando convalidación con ID Estudiante:', id_estudiante);

    // Obtener los datos enviados en el cuerpo de la solicitud
    const { estado_informe_convalidacion, comentario_convalidacion } = req.body;
    
    // Imprimir los datos que se reciben para depuración
    console.log('Datos recibidos:', { estado_informe_convalidacion, comentario_convalidacion });

    // Validar que se hayan recibido ambos campos
    if (!estado_informe_convalidacion || !comentario_convalidacion) {
      return res.status(400).json({ message: 'Ambos campos (estado y comentario) son requeridos' });
    }

    // Crear la consulta SQL para actualizar el estado del informe y el comentario de convalidación
    const query = `
      UPDATE convalidaciones_experiencias
      SET 
        estado_informe_convalidacion = ?, 
        comentario_convalidacion = ?
      WHERE id_estudiante = ?
    `;

    // Ejecutar la consulta SQL para actualizar la base de datos
    db.query(query, [estado_informe_convalidacion, comentario_convalidacion, id_estudiante], (err, result) => {
      if (err) {
        console.error('Error al actualizar la convalidación:', err);
        return res.status(500).json({ message: 'Error al actualizar la convalidación' });
      }

      // Verificar si se actualizó el registro
      if (result.affectedRows > 0) {
        console.log('Convalidación actualizada correctamente para el estudiante con ID:', id_estudiante);
        return res.status(200).json({ message: 'Convalidación actualizada correctamente' });
      } else {
        console.log('No se encontró el estudiante con el ID:', id_estudiante);
        return res.status(404).json({ message: 'Estudiante no encontrado' });
      }
    });
  });

  //EN LA VISTA COMSION--------------------------------------------------------------------------------------


  // Ruta para actualizar el comentario de notificación
  app.put('/api/notificar_convalidacion/:id_estudiante', (req, res) => {
    const { id_estudiante } = req.params; // Obtener el id_estudiante desde la URL
    console.log('Actualizando notificación con ID Estudiante:', id_estudiante);

    // Obtener los datos enviados en el cuerpo de la solicitud
    const { comentario_notificacion } = req.body;

    // Imprimir los datos que se reciben para depuración
    console.log('Datos recibidos:', { comentario_notificacion });

    // Validar que se haya recibido el campo comentario_notificacion
    if (!comentario_notificacion) {
      return res.status(400).json({ message: 'El campo comentario_notificacion es requerido' });
    }

    // Crear la consulta SQL para actualizar el comentario de notificación
    const query = `
      UPDATE convalidaciones_experiencias
      SET comentario_notificacion = ?
      WHERE id_estudiante = ?
    `;

    // Ejecutar la consulta SQL para actualizar la base de datos
    db.query(query, [comentario_notificacion, id_estudiante], (err, result) => {
      if (err) {
        console.error('Error al actualizar la notificación:', err);
        return res.status(500).json({ message: 'Error al actualizar la notificación' });
      }

      // Verificar si se actualizó el registro
      if (result.affectedRows > 0) {
        console.log('Notificación actualizada correctamente para el estudiante con ID:', id_estudiante);
        return res.status(200).json({ message: 'Notificación actualizada correctamente' });
      } else {
        console.log('No se encontró el estudiante con el ID:', id_estudiante);
        return res.status(404).json({ message: 'Estudiante no encontrado' });
      }
    });
  });



  // Configuración de Nodemailer para enviar el correo con Gmail
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: '72848846@continental.edu.pe', // Reemplaza con tu correo de Gmail
      pass: 'Ander77melval@exo' // Reemplaza con tu contraseña de Gmail
    }
  });

  // Endpoint para notificar al estudiante por correo electrónico
  app.put('/api/notificar_gmail/:id_estudiante', async (req, res) => {
    try {
      const { id_estudiante } = req.params; // Obtener el id_estudiante desde los parámetros de la URL
      const { comentario_notificacion, email_estudiante } = req.body; // Obtener los datos del cuerpo de la solicitud

      // Verificamos que se haya proporcionado un correo
      if (!email_estudiante || !comentario_notificacion) {
        return res.status(400).json({ message: 'El correo electrónico y el mensaje son requeridos.' });
      }

      // Configuramos el mensaje que se enviará
      const mailOptions = {
        from: '72848846@continental.edu.pe', // Reemplaza con tu correo de Gmail
        to: email_estudiante, // El correo del estudiante que recibe la notificación
        subject: 'Notificación de Proceso de Convalidación',
        text: comentario_notificacion, // El mensaje que se enviará al estudiante
      };

      // Enviar el correo electrónico
      const info = await transporter.sendMail(mailOptions);

      console.log('Correo enviado:', info.response);

      // Respondemos al cliente con un mensaje de éxito
      res.status(200).json({ message: 'Correo de notificación enviado correctamente' });
    } catch (error) {
      console.error('Error al enviar el correo:', error);
      res.status(500).json({ message: 'Error al enviar el correo' });
    }
  });



  
  
  
  


  // Si usas React, por ejemplo
  app.use(express.static(path.join(__dirname, 'dist')));

  // Para cualquier otra ra, servir el index.html
  app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });


  app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
  });
