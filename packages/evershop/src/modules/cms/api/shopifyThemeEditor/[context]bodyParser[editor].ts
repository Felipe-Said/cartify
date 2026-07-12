import bodyParser from 'body-parser';

export default (request, response, next) => {
  if (request.method === 'GET') {
    next();
    return;
  }
  bodyParser.json({ inflate: false, limit: '10mb' })(request, response, next);
};
