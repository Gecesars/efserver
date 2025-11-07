from flask import render_template, Blueprint
from flask_login import login_required


bp = Blueprint('main', __name__)

@bp.route('/')
@bp.route('/index')
@login_required
def index():
    return render_template('index.html', title='Home')
