// https://github.com/hacker-bastl/git-api-d3js-test#readme

const githubModel = {
  networkData: {
    ids: new Map(),
    nodes: [],
    links: [],
  },

  // TODO: refactor, this is redundant w/ d3 data model
  uniqueNode: function(data, type) {
    if (!data.id) throw new Error('data id missing');
    if (!data.type) data.type = type || 'unknown';

    if (githubModel.networkData.ids.has(data.id)) {
      var cached = githubModel.networkData.ids.get(data.id);
      // for (var key in data) cached[key] = data[key];
      return cached;
    } else {
      githubModel.networkData.ids.set(data.id, data);
      githubModel.networkData.nodes.push(data);
      return data;
    }
  },

  // TODO: refactor, wrong abstraction here
  connectNode: function(data, type) {
    var source = githubModel.uniqueNode(data, type);
    var connection = {

      timestamp: function(timestamp) {
        var date = (timestamp || 'unknown').substring(0, 10);
        if (date.length != 10) console.warn(timestamp); // TODO
        var node = githubModel.uniqueNode({
          name: date,
          id: date,
        }, 'Date');
        return connection.connect(node);
      },

      connect: function(data, type) {
        githubModel.networkData.links.push({
          target: githubModel.uniqueNode(data, type),
          source: source,
        });
        return connection;
      },
    };
    return connection;
  },

  // TODO: refactor, this is redundant w/ d3 data model
  clearContents: function() {
    while (githubModel.networkData.links.length > 0)
      delete(githubModel.networkData.links.pop());
    while (githubModel.networkData.nodes.length > 0)
      delete(githubModel.networkData.nodes.pop());
    githubModel.networkData.ids.clear();
    return githubModel;
  },

};

// TODO: how to abstract this properly?
githubModel.repository = function(data) {
  var repo = githubModel.connectNode(data, 'Repository');
  repo.timestamp(data.updated_at || data.created_at);
  data.owner.name = data.owner.login;
  repo.connect(data.owner, 'User');
  return repo;
};

// TODO: how to abstract this properly?
githubModel.event = function(data) {
  var event = githubModel.connectNode(data, 'Event');
  event.timestamp(data.updated_at || data.created_at);

  // TODO: for user "stubs" which haven't loaded
  if (data.login && !data.html_url) data.html_url = '//github.com/' + data.login;

  // TODO: refactur / extract to own parsers?
  if (!!data.actor) event.connect(data.actor, 'User');
  if (!!data.org) event.connect(data.org, 'Organization');
  if (!!data.repo) event.connect(data.repo, 'Repository');
  // if (!!data.payload) event.connect(data.payload); // TODO
  return event;
};

// TODO: smells - refactor!
githubModel.avatar = function(d) {
  if (!!d.avatar_url) return d.avatar_url;
  else return '//assets-cdn.github.com/images/icons/emoji/' + ({
    'Organization': 'unicode/1f465.png',
    'Repository': 'unicode/1f465.png',
    'Repository': 'unicode/1f4c2.png',
    'User': 'unicode/1f464.png',
    'Date': 'unicode/1f4c6.png',
  }[d.type] || 'octocat.png');
};


// graph with automated resizing and zoom
const networkGraph = new function() {
  // https://bl.ocks.org/mbostock/1095795
  var root = d3.select('svg').attr('x', 0).attr('y', 0).attr('width', window.innerWidth).attr('height', window.innerHeight);
  var canvas = root.append('g').attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ')');
  var zoom = 1; // TODO: smells?

  // http://bl.ocks.org/aaizemberg/78bd3dade9593896a59d
  this.color = d3.scaleOrdinal(d3['schemeCategory20c']);

  // persistent pointers to graph nodes
  this.nodes = canvas.selectAll('g');
  this.links = canvas.selectAll('line');

  // update overall transformation on resize
  d3.select(window).on('resize', function() {
    canvas.attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ') scale(' + zoom + ')');
    root.attr('width', window.innerWidth).attr('height', window.innerHeight);
  });

  // https://github.com/d3/d3-zoom#zoom
  root.call(d3.zoom().scaleExtent([0.2, 2.0]).on('zoom', function() {
    zoom = d3.event.transform.k;
    canvas.attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ') scale(' + zoom + ')');
  }));
};

// https://github.com/d3/d3-force/#forceSimulation
networkGraph.layout = d3.forceSimulation(githubModel.networkData.nodes)
  .force('x', d3.forceX()).force('y', d3.forceY()).alphaTarget(1)
  // https://github.com/d3/d3-force/#manyBody_strength
  .force('charge', d3.forceManyBody().strength(10 * -30))
  // https://github.com/d3/d3-force/#link_distance
  .force('link', d3.forceLink(githubModel.networkData.links).distance(5 * 30))
  // https://github.com/d3/d3-force/#simulation_tick
  .on('tick', function() {
    networkGraph.nodes.attr('transform', function(d) {
      return 'translate(' + d.x + ',' + d.y + ')';
    });
    networkGraph.links.attr('x1', function(d) {
      return d.source.x;
    }).attr('y1', function(d) {
      return d.source.y;
    }).attr('x2', function(d) {
      return d.target.x;
    }).attr('y2', function(d) {
      return d.target.y;
    });
  });

// https://bl.ocks.org/mbostock/3808218
networkGraph.updateData = function() {
  networkGraph.nodes = networkGraph.nodes
    .data(githubModel.networkData.nodes, function(d) {
      return d.id;
    });
  networkGraph.nodes.exit().remove();
  networkGraph.nodes = networkGraph.nodes.enter()
    .append('g').merge(networkGraph.nodes);

  // white bg for unicode icons and transparent avatars
  networkGraph.nodes.append('circle')
    .attr('fill', '#fff').attr('r', 24);

  // append avatar image
  networkGraph.nodes.append('image')
    .attr('xlink:href', githubModel.avatar)
    .on('click', networkGraph.click)
    .attr('x', function(d) {
      return !!d.avatar_url ? -32 : -20;
    }).attr('y', function(d) {
      return !!d.avatar_url ? -32 : -20;
    }).attr('width', function(d) {
      return !!d.avatar_url ? 64 : 40;
    }).attr('height', function(d) {
      return !!d.avatar_url ? 64 : 40;
    });

  // TODO: text often unreadable - improve how?
  networkGraph.nodes.append('a') //.attr('y', '1.5em')
    .attr('target', '_new').attr('xlink:href', function(d) {
      return !!d.html_url ? d.html_url : '#';
    }).attr('xlink:title', function(d) {
      return JSON.stringify(d, null, 4);
    }).append('text').text(function(d) {
      return d.name || d.login || d.type || d.id;
    });

  // update links
  networkGraph.links = networkGraph.links
    .data(githubModel.networkData.links, function(d) {
      return d.source.id + '-' + d.target.id;
    });
  networkGraph.links.exit().remove();
  networkGraph.links = networkGraph.links.enter()
    .insert('line', 'g').merge(networkGraph.links);

  // restart layout
  networkGraph.layout.nodes(githubModel.networkData.nodes);
  networkGraph.layout.force('link').links(githubModel.networkData.links);
  networkGraph.layout.alpha(1).restart();
};

// https://developer.mozilla.org/docs/Web/API/Window/open
networkGraph.click = function(node) {
  if (!!node.url) d3.json(node.url, function(error, response) {
    if (!!error) throw error;
    console.info(response); // debugging...

    var append = githubModel.connectNode(response);
    if (!!response.repos_url)
      d3.json(response.repos_url, function(error, response) {
        if (!!error) throw error;
        console.log(response);

        response.slice(0, 8).forEach(append.connect);
        networkGraph.updateData();

      });
    if (!!response.organizations_url)
      d3.json(response.organizations_url, function(error, response) {
        if (!!error) throw error;
        console.log(response);

        response.slice(0, 8).forEach(append.connect);
        networkGraph.updateData();

      });
    if (!!response.events_url)
      d3.json(response.events_url.split('{').shift(), function(error, response) {
        if (!!error) throw error;
        console.log(response);

        response.slice(0, 8).forEach(append.connect);
        networkGraph.updateData();

      });

  });
};

// https://help.github.com/articles/search-syntax/
networkGraph.search = function(text) {

  githubModel.clearContents();
  networkGraph.updateData();

  d3.json('//api.github.com/search/repositories?q=' + text, function(error, result) {
    if (!!error) throw error;

    result.items.forEach(githubModel.repository);
    networkGraph.updateData();
  });
};

networkGraph.updateData();

// https://developer.github.com/v3/activity/events/#list-public-events
d3.json('//api.github.com/events?per_page=16', function(error, events) {
  if (!!error) throw error;

  events.forEach(githubModel.event);
  networkGraph.updateData();
});

// hook up search input box - TODO: move this?
(function(searchbox) {
  searchbox.node.addEventListener('keyup', function() {
    clearTimeout(searchbox.delay);
    searchbox.delay = setTimeout(function() {
      networkGraph.search(searchbox.node.value.trim());
    }, 2E3);
  });
})({
  node: document.querySelector('[role=search]>input[type=text]'),
  delay: null,
});
