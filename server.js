const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
const PORT = process.env.PORT || 3001;
const MOCKS_DIR = path.join(__dirname, 'mocks');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Configuração do Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Mock Server API',
      version: '1.0.0',
      description: 'API para simulação de endpoints e testes de diferentes cenários',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Servidor de desenvolvimento',
      },
    ],
    tags: [
      {
        name: 'Config',
        description: 'Endpoints para gerenciar configuração de casos de uso',
      },
      {
        name: 'Endpoints',
        description: 'Endpoints para consultar e listar mocks disponíveis',
      },
      {
        name: 'Mock',
        description: 'Endpoints mockados dinamicamente',
      },
    ],
  },
  apis: ['./server.js'], // Caminho para os arquivos com anotações
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Mock Server API Documentation',
}));

// Função auxiliar para garantir que diretórios existam
function ensureDirectoriesExist() {
  if (!fs.existsSync(MOCKS_DIR)) {
    fs.mkdirSync(MOCKS_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({}, null, 2));
  }
}

// Função para criar chave de consulta
function createQueryKey(method, path, query) {
  // Remove query strings e fragmentos
  const pathWithoutQuery = path.split('?')[0].split('#')[0];
  // Remove barra inicial e substitui barras por hífens
  let normalizedPath = pathWithoutQuery.replace(/^\//, '').replace(/\//g, '-');
  
  // Se houver query params, inclui os parâmetros requestDTO.* na chave (exceto datas)
  if (query && Object.keys(query).length > 0) {
    const requestDTOParams = [];
    
    // Coleta todos os parâmetros que começam com "requestDTO." (ignorando datas)
    Object.keys(query)
      .filter(key => {
        if (!key.startsWith('requestDTO.')) {
          return false;
        }
        const paramName = key.replace('requestDTO.', '');
        // Ignora parâmetros de data
        return !paramName.includes('data') && !paramName.includes('Data') && 
               !paramName.includes('dataInicio') && !paramName.includes('dataFim') &&
               !paramName.includes('dataInicio') && !paramName.includes('dataFim');
      })
      .sort() // Ordena para garantir consistência
      .forEach(key => {
        const paramName = key.replace('requestDTO.', '');
        const paramValue = query[key];
        
        // Normaliza o valor: remove caracteres especiais e converte para lowercase quando apropriado
        let normalizedValue = String(paramValue);
        
        // Para status, converte para lowercase
        if (paramName === 'status') {
          normalizedValue = normalizedValue.toLowerCase();
        }
        // Para outros valores, remove caracteres especiais e converte para lowercase
        else {
          normalizedValue = normalizedValue.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        }
        
        requestDTOParams.push(`${paramName}-${normalizedValue}`);
      });
    
    if (requestDTOParams.length > 0) {
      normalizedPath = `${normalizedPath}-${requestDTOParams.join('-')}`;
    }
  }
  
  return `${method.toLowerCase()}.${normalizedPath}`;
}

// Função para carregar config.json
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return {};
    }
    const content = fs.readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Erro ao carregar config.json:', error);
    return {};
  }
}

// Função para salvar config.json
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Erro ao salvar config.json:', error);
    return false;
  }
}

// Função para obter caso de uso ativo
function getActiveUseCase(queryKey, config) {
  const endpointConfig = config[queryKey];
  if (!endpointConfig) {
    return null;
  }
  
  // Encontra o caso de uso que está ativo (true)
  for (const [useCase, isActive] of Object.entries(endpointConfig)) {
    if (isActive === true) {
      return useCase;
    }
  }
  
  return null;
}

// Função para carregar mock
function loadMock(queryKey, useCase) {
  const fileName = `${queryKey}.${useCase}.json`;
  const filePath = path.join(MOCKS_DIR, fileName);
  
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Erro ao carregar mock ${fileName}:`, error);
    return null;
  }
}

// Função para listar todos os arquivos de mock
function listAllMocks() {
  const mocks = {};
  
  try {
    if (!fs.existsSync(MOCKS_DIR)) {
      return mocks;
    }
    
    const files = fs.readdirSync(MOCKS_DIR);
    const config = loadConfig();
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const parts = file.replace('.json', '').split('.');
        if (parts.length >= 2) {
          const useCase = parts.pop();
          const queryKey = parts.join('.');
          
          if (!mocks[queryKey]) {
            mocks[queryKey] = {
              useCases: {},
              activeUseCase: getActiveUseCase(queryKey, config)
            };
          }
          
          try {
            const mockContent = loadMock(queryKey, useCase);
            mocks[queryKey].useCases[useCase] = mockContent;
          } catch (error) {
            mocks[queryKey].useCases[useCase] = { error: 'Erro ao carregar mock' };
          }
        }
      }
    });
  } catch (error) {
    console.error('Erro ao listar mocks:', error);
  }
  
  return mocks;
}

/**
 * @swagger
 * /{path}:
 *   get:
 *     summary: Endpoint mockado dinâmico (GET)
 *     description: Retorna resposta mockada baseada na configuração ativa. A chave de consulta é criada automaticamente a partir do método e path.
 *     tags: [Mock]
 *     parameters:
 *       - in: path
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Path do endpoint (ex: "api/users")
 *     responses:
 *       200:
 *         description: Resposta mockada retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Mock não encontrado ou caso de uso não configurado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 queryKey:
 *                   type: string
 *                 message:
 *                   type: string
 *   post:
 *     summary: Endpoint mockado dinâmico (POST)
 *     description: Retorna resposta mockada baseada na configuração ativa. A chave de consulta é criada automaticamente a partir do método e path.
 *     tags: [Mock]
 *     parameters:
 *       - in: path
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Path do endpoint
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Resposta mockada retornada com sucesso
 *       404:
 *         description: Mock não encontrado ou caso de uso não configurado
 *   put:
 *     summary: Endpoint mockado dinâmico (PUT)
 *     description: Retorna resposta mockada baseada na configuração ativa.
 *     tags: [Mock]
 *     parameters:
 *       - in: path
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Resposta mockada retornada com sucesso
 *       404:
 *         description: Mock não encontrado ou caso de uso não configurado
 *   delete:
 *     summary: Endpoint mockado dinâmico (DELETE)
 *     description: Retorna resposta mockada baseada na configuração ativa.
 *     tags: [Mock]
 *     parameters:
 *       - in: path
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Resposta mockada retornada com sucesso
 *       404:
 *         description: Mock não encontrado ou caso de uso não configurado
 */
// Rota genérica para capturar todas as requisições
app.all('*', (req, res, next) => {
  // Ignora rotas de controle e Swagger
  if (req.path === '/config' || req.path === '/endpoints' || req.path.startsWith('/api-docs')) {
    return next();
  }
  
  const queryKey = createQueryKey(req.method, req.path, req.query);
  const config = loadConfig();
  const activeUseCase = getActiveUseCase(queryKey, config);
  
  if (!activeUseCase) {
    return res.status(404).json({
      error: 'Mock não encontrado',
      queryKey,
      message: `Nenhum caso de uso ativo encontrado para ${queryKey}. Verifique o config.json.`
    });
  }
  
  const mock = loadMock(queryKey, activeUseCase);

  console.log('🔍 [MOCK] Mock response:', { queryKey, activeUseCase, mock: !!mock });
  
  if (!mock) {
    return res.status(404).json({
      error: 'Arquivo de mock não encontrado',
      queryKey,
      useCase: activeUseCase,
      expectedFile: `${mockKey}.${activeUseCase}.json`
    });
  }
  
  // Aplica headers customizados se existirem
  if (mock.headers) {
    Object.keys(mock.headers).forEach(key => {
      res.setHeader(key, mock.headers[key]);
    });
  }
  
  // Retorna o status e response do mock
  return res.status(mock.status || 200).json(mock.response);
});

/**
 * @swagger
 * /config:
 *   get:
 *     summary: Retorna a configuração atual de casos de uso
 *     description: Retorna o arquivo config.json completo com todos os endpoints e seus casos de uso ativos
 *     tags: [Config]
 *     responses:
 *       200:
 *         description: Configuração retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 additionalProperties:
 *                   type: boolean
 *               example:
 *                 "get.api-users":
 *                   "success": true
 *                   "error": false
 *                 "post.api-auth-login":
 *                   "success": true
 *                   "invalid_credentials": false
 */
app.get('/config', (req, res) => {
  const config = loadConfig();
  res.json(config);
});

/**
 * @swagger
 * /config:
 *   post:
 *     summary: Atualiza a configuração de casos de uso
 *     description: Sobrescreve completamente o arquivo config.json com a nova configuração fornecida
 *     tags: [Config]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties:
 *               type: object
 *               additionalProperties:
 *                 type: boolean
 *           example:
 *             "get.api-users":
 *               "success": false
 *               "error": true
 *             "post.api-auth-login":
 *               "success": true
 *               "invalid_credentials": false
 *     responses:
 *       200:
 *         description: Configuração atualizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 config:
 *                   type: object
 *       400:
 *         description: Body inválido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       500:
 *         description: Erro ao salvar configuração
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
app.post('/config', (req, res) => {
  const newConfig = req.body;
  
  if (!newConfig || typeof newConfig !== 'object') {
    return res.status(400).json({
      error: 'Body deve ser um objeto JSON válido'
    });
  }
  
  if (saveConfig(newConfig)) {
    res.json({
      success: true,
      message: 'Config atualizado com sucesso',
      config: newConfig
    });
  } else {
    res.status(500).json({
      error: 'Erro ao salvar config'
    });
  }
});

/**
 * @swagger
 * /endpoints:
 *   get:
 *     summary: Lista todos os endpoints mockados disponíveis
 *     description: Retorna todos os endpoints organizados por chave de consulta, incluindo todos os casos de uso e seus responses
 *     tags: [Endpoints]
 *     responses:
 *       200:
 *         description: Lista de endpoints retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   activeUseCase:
 *                     type: string
 *                     description: Caso de uso ativo no momento
 *                   useCases:
 *                     type: object
 *                     additionalProperties:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: number
 *                         response:
 *                           type: object
 *                         headers:
 *                           type: object
 *             example:
 *               "get.api-users":
 *                 activeUseCase: "success"
 *                 useCases:
 *                   success:
 *                     status: 200
 *                     response:
 *                       users: []
 *                   error:
 *                     status: 500
 *                     response:
 *                       error: "Internal server error"
 */
app.get('/endpoints', (req, res) => {
  const mocks = listAllMocks();
  res.json(mocks);
});

/**
 * @swagger
 * /endpoints:
 *   post:
 *     summary: Consulta endpoints com filtros opcionais
 *     description: Permite filtrar endpoints por queryKey, useCase ou ambos. Se nenhum filtro for fornecido, retorna todos os endpoints.
 *     tags: [Endpoints]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               queryKey:
 *                 type: string
 *                 description: Chave de consulta do endpoint (ex: "get.api-users")
 *                 example: "get.api-users"
 *               useCase:
 *                 type: string
 *                 description: Caso de uso específico (ex: "success", "error")
 *                 example: "success"
 *           example:
 *             queryKey: "get.api-users"
 *             useCase: "success"
 *     responses:
 *       200:
 *         description: Endpoints filtrados retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   activeUseCase:
 *                     type: string
 *                   useCases:
 *                     type: object
 *                     additionalProperties:
 *                       type: object
 */
app.post('/endpoints', (req, res) => {
  const { queryKey, useCase } = req.body;
  const allMocks = listAllMocks();
  
  let result = {};
  
  if (queryKey && useCase) {
    // Filtro específico: queryKey e useCase
    if (allMocks[queryKey] && allMocks[queryKey].useCases[useCase]) {
      result[queryKey] = {
        useCases: {
          [useCase]: allMocks[queryKey].useCases[useCase]
        },
        activeUseCase: allMocks[queryKey].activeUseCase
      };
    }
  } else if (queryKey) {
    // Filtro por queryKey apenas
    if (allMocks[queryKey]) {
      result[queryKey] = allMocks[queryKey];
    }
  } else if (useCase) {
    // Filtro por useCase apenas
    Object.keys(allMocks).forEach(key => {
      if (allMocks[key].useCases[useCase]) {
        result[key] = {
          useCases: {
            [useCase]: allMocks[key].useCases[useCase]
          },
          activeUseCase: allMocks[key].activeUseCase
        };
      }
    });
  } else {
    // Sem filtros, retorna tudo
    result = allMocks;
  }
  
  res.json(result);
});

// Inicialização
ensureDirectoriesExist();

app.listen(PORT, () => {
  console.log(`🚀 Mock Server rodando na porta ${PORT}`);
  console.log(`📁 Mocks em: ${MOCKS_DIR}`);
  console.log(`⚙️  Config em: ${CONFIG_FILE}`);
  console.log(`\n📚 Documentação Swagger:`);
  console.log(`  http://localhost:${PORT}/api-docs`);
  console.log(`\nEndpoints disponíveis:`);
  console.log(`  GET  /config - Ver configuração atual`);
  console.log(`  POST /config - Atualizar configuração`);
  console.log(`  GET  /endpoints - Listar todos os endpoints`);
  console.log(`  POST /endpoints - Consultar endpoints com filtros`);
  console.log(`\nQualquer outra rota será tratada como mock se configurada.\n`);
});

