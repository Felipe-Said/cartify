import bodyParser from 'body-parser';
import multer from 'multer';

export default (request, response, next) => {
  const type = request.headers['content-type'] || '';
  if (type.includes('multipart/form-data')) {
    multer().none()(request, response, next);
  } else if (type.includes('application/json')) {
    bodyParser.json({ inflate: false })(request, response, next);
  } else {
    bodyParser.urlencoded({ extended: true })(request, response, next);
  }
};
